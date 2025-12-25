import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

export type GestureMode = 'TREE' | 'SCATTER' | 'FOCUS';

export interface HandState {
  detected: boolean;
  x: number;
  y: number;
  mode: GestureMode;
}

export function useMediaPipe(videoElement: HTMLVideoElement | null, enabled: boolean = true) {
  const [handState, setHandState] = useState<HandState>({
    detected: false,
    x: 0,
    y: 0,
    mode: 'TREE',
  });

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // 如果 disabled，清理资源并返回
    if (!enabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    let mounted = true;

    const initializeMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        if (!mounted) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });

        if (!mounted) return;

        handLandmarkerRef.current = handLandmarker;
        console.log('✅ MediaPipe Hand Landmarker initialized');
        console.log('[MediaPipe] Video element:', videoElement ? 'present' : 'null', videoElement?.videoWidth, 'x', videoElement?.videoHeight);

        if (videoElement) {
          startDetection();
        } else {
          console.warn('[MediaPipe] Video element not available, waiting...');
        }
      } catch (error) {
        console.error('Failed to initialize MediaPipe:', error);
      }
    };

    const startDetection = () => {
      // 创建用于旋转视频的 canvas（如果需要）
      let needsRotation = false;
      let rotationCanvas: HTMLCanvasElement | null = null;
      let rotationCtx: CanvasRenderingContext2D | null = null;

      const detectHands = () => {
        if (!videoElement || !handLandmarkerRef.current || !enabled) {
          if (!videoElement) {
            console.warn('[MediaPipe] Video element not available');
          }
          if (!handLandmarkerRef.current) {
            console.warn('[MediaPipe] Hand landmarker not initialized');
          }
          if (!enabled) {
            console.log('[MediaPipe] Detection disabled');
          }
          return;
        }

        // 确保视频已准备好：已加载、有尺寸、正在播放
        const isVideoReady = 
          videoElement.readyState >= 2 && // HAVE_CURRENT_DATA
          videoElement.videoWidth > 0 && 
          videoElement.videoHeight > 0 &&
          !videoElement.paused;

        if (!isVideoReady) {
          animationFrameRef.current = requestAnimationFrame(detectHands);
          return;
        }

        // 检查是否需要旋转（竖屏视频需要顺时针旋转90度给MediaPipe处理）
        // 用户看到的画面不旋转，但处理时需要旋转
        const isPortrait = videoElement.videoHeight > videoElement.videoWidth;
        if (isPortrait) {
          if (!rotationCanvas) {
            rotationCanvas = document.createElement('canvas');
            rotationCtx = rotationCanvas.getContext('2d');
            if (!rotationCtx) {
              console.error('[MediaPipe] Failed to get canvas context');
              return;
            }
            // 旋转后的尺寸：宽高互换（顺时针旋转90度后，竖屏变横屏）
            rotationCanvas.width = videoElement.videoHeight;
            rotationCanvas.height = videoElement.videoWidth;
            needsRotation = true;
            console.log('[MediaPipe] Video is portrait, creating rotation canvas for gesture detection');
          }
        } else {
          // 横屏视频不需要旋转
          needsRotation = false;
        }

        if (videoElement.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = videoElement.currentTime;

          try {
            let videoToProcess: HTMLVideoElement | HTMLCanvasElement = videoElement;
            
            // 如果需要旋转（竖屏视频），先绘制到 canvas 并顺时针旋转90度
            // 这样MediaPipe就能正确识别手势，用户看到的画面保持不变
            if (needsRotation && rotationCanvas && rotationCtx) {
              // 清空画布
              rotationCtx.clearRect(0, 0, rotationCanvas.width, rotationCanvas.height);
              rotationCtx.save();
              // 移动到画布中心
              rotationCtx.translate(rotationCanvas.width / 2, rotationCanvas.height / 2);
              // 顺时针旋转90度（Math.PI / 2）
              rotationCtx.rotate(Math.PI / 2);
              // 绘制视频（注意坐标需要调整，因为旋转后坐标系统变了）
              rotationCtx.drawImage(
                videoElement,
                -videoElement.videoWidth / 2,
                -videoElement.videoHeight / 2,
                videoElement.videoWidth,
                videoElement.videoHeight
              );
              rotationCtx.restore();
              videoToProcess = rotationCanvas;
            }

            const result = handLandmarkerRef.current.detectForVideo(
              videoToProcess,
              performance.now()
            );
            processGestures(result);
          } catch (error) {
            console.warn('[MediaPipe] Detection error:', error);
          }
        }

        animationFrameRef.current = requestAnimationFrame(detectHands);
      };

      detectHands();
    };

    const processGestures = (result: HandLandmarkerResult) => {
      if (result.landmarks && result.landmarks.length > 0) {
        const lm = result.landmarks[0];
        
        // Hand position (middle finger MCP)
        const x = (lm[9].x - 0.5) * 2;
        const y = (lm[9].y - 0.5) * 2;

        // Gesture detection
        const thumb = lm[4];
        const index = lm[8];
        const wrist = lm[0];
        
        // Pinch detection (thumb and index finger close)
        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
        
        // Openness detection (average distance of fingertips from wrist)
        const tips = [lm[8], lm[12], lm[16], lm[20]];
        let avgDist = 0;
        tips.forEach(t => avgDist += Math.hypot(t.x - wrist.x, t.y - wrist.y));
        avgDist /= 4;

        let mode: GestureMode;
        if (pinchDist < 0.05) {
          mode = 'FOCUS'; // Pinch gesture
        } else if (avgDist < 0.25) {
          mode = 'TREE'; // Closed fist
        } else {
          mode = 'SCATTER'; // Open hand
        }

        setHandState({
          detected: true,
          x,
          y,
          mode,
        });
      } else {
        setHandState(prev => ({
          ...prev,
          detected: false,
          mode: 'TREE', // Default to tree mode when no hand detected
        }));
      }
    };

    initializeMediaPipe();

    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      handLandmarkerRef.current?.close();
    };
  }, [videoElement, enabled]);

  return handState;
}
