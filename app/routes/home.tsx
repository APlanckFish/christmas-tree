import type { MetaFunction } from "react-router";
import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import ChristmasTree from "~/components/ChristmasTree";
import { useMediaPipe } from "~/hooks/useMediaPipe";
import "./home.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Merry Christmas 🎄" },
    { name: "description", content: "Interactive 3D Christmas Tree with Gesture Control" },
  ];
};

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [serverIP, setServerIP] = useState("");
  const [showIPInput, setShowIPInput] = useState(false);
  const [roomId] = useState(() => Math.random().toString(36).substring(2, 15).toUpperCase());
  const [detectedIP, setDetectedIP] = useState<string>("");
  const [showQRModal, setShowQRModal] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const [isRemoteCamera, setIsRemoteCamera] = useState(false);
  const isRemoteCameraRef = useRef(false); // 用于在闭包中访问最新状态
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);

  const handState = useMediaPipe(
    isRemoteCamera ? remoteVideoRef.current : localVideoRef.current,
    videoReady // 视频准备好时启用 MediaPipe（无论是本地还是远程摄像头）
  );

  // 自动检测本机 IP
  useEffect(() => {
    async function detectLocalIP() {
      try {
        // 使用 RTCPeerConnection 获取本地 IP
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });
        
        pc.createDataChannel("");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const localIP = await new Promise<string>((resolve) => {
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              const candidate = event.candidate.candidate;
              const ipMatch = candidate.match(/(\d{1,3}\.){3}\d{1,3}/);
              if (ipMatch && !ipMatch[0].startsWith("127.")) {
                resolve(ipMatch[0]);
                pc.close();
              }
            }
          };
          
          // 超时后使用 hostname
          setTimeout(() => {
            resolve(window.location.hostname);
            pc.close();
          }, 2000);
        });
        
        console.log('[IP Detection] Detected local IP:', localIP);
        setDetectedIP(localIP);
        
        // 加载保存的 IP
        const savedIP = localStorage.getItem('christmas-tree-server-ip');
        if (savedIP) {
          setServerIP(savedIP);
        }
      } catch (error) {
        console.error('[IP Detection] Failed:', error);
        setDetectedIP(window.location.hostname);
      }
    }
    
    detectLocalIP();
    startLocalCamera();
    
    // 背景音乐
    if (bgmRef.current) {
      bgmRef.current.volume = 0.3;
      bgmRef.current.play().catch(() => {
        // 自动播放失败，等待用户交互
        const playOnClick = () => {
          bgmRef.current?.play().then(() => {
            document.removeEventListener('click', playOnClick);
          }).catch(() => {});
        };
        document.addEventListener('click', playOnClick, { once: true });
      });
    }
    
    // 键盘快捷键 - H 键隐藏/显示 UI
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setUiHidden(!uiHidden);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pcRef.current) pcRef.current.close();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 生成二维码
  useEffect(() => {
    if (showQRModal && qrCanvasRef.current) {
      // 使用用户输入的 IP，或检测到的 IP，或 hostname
      let ip = serverIP.trim() || detectedIP || window.location.hostname;
      
      // 如果IP是localhost或127.0.0.1，且没有检测到IP，提示用户
      if ((ip === 'localhost' || ip === '127.0.0.1') && !detectedIP) {
        console.warn('[QRCode] Using localhost, phone may not be able to access. Please configure server IP.');
      }
      
      // 使用当前页面的端口，或环境变量配置的端口
      const currentPort = window.location.port;
      const envPort = import.meta.env.VITE_HTTP_PORT;
      const httpPort = currentPort || envPort || (window.location.protocol === 'https:' ? '443' : '8080');
      const protocol = window.location.protocol;
      
      // 构建完整的URL - 始终包含端口（除非是标准端口）
      // 同时传递服务器IP给手机端，用于WebSocket连接
      let qrUrl: string;
      if (httpPort && httpPort !== '443' && httpPort !== '80') {
        qrUrl = `${protocol}//${ip}:${httpPort}/phone-camera?room=${roomId}&server=${ip}`;
      } else {
        qrUrl = `${protocol}//${ip}/phone-camera?room=${roomId}&server=${ip}`;
      }
      
      console.log('[QRCode] Generating QR code for:', qrUrl);
      console.log('[QRCode] IP:', ip, 'Port:', httpPort, 'Protocol:', protocol);
      QRCode.toCanvas(qrCanvasRef.current, qrUrl, { 
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
        .then(() => {
          console.log('[QRCode] QR code generated successfully');
        })
        .catch((error) => {
          console.error('[QRCode] Failed to generate QR code:', error);
        });
    }
  }, [showQRModal, serverIP, detectedIP, roomId]);

  async function startLocalCamera() {
    try {
      console.log('[Camera] Starting local camera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user' // 前置摄像头
        },
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        
        // 等待视频元素准备好
        localVideoRef.current.onloadedmetadata = () => {
          console.log('[Camera] Local camera ready');
          console.log('[Camera] Local video dimensions:', localVideoRef.current?.videoWidth, 'x', localVideoRef.current?.videoHeight);
          
          // 初始化时，如果还没有连接远程摄像头，使用本地摄像头并启用 MediaPipe
          // 使用 setTimeout 确保视频元素完全准备好
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              // 只有在没有连接远程摄像头时才启用本地摄像头
              // 注意：这里需要检查当前的 isRemoteCamera 状态，但初始化时应该是 false
              const currentIsRemote = isRemoteCamera; // 捕获当前状态
              if (!currentIsRemote) {
                setVideoReady(true);
                console.log('[Camera] Video ready, MediaPipe enabled for local camera');
              } else {
                console.log('[Camera] Local camera ready but remote camera is active, MediaPipe not enabled');
              }
            } else {
              console.warn('[Camera] Local video not fully ready yet');
            }
          }, 300);
        };
        
        // 确保视频播放
        localVideoRef.current.oncanplay = () => {
          console.log('[Camera] Local video can play');
          localVideoRef.current?.play().catch(err => {
            console.error('[Camera] Error playing local video:', err);
          });
        };
        
        localVideoRef.current.onerror = (error) => {
          console.error('[Camera] Local video error:', error);
        };
      }
    } catch (error) {
      console.error("Local camera error:", error);
    }
  }

  async function connectPhoneCamera() {
    // 保存 IP 到 localStorage
    if (serverIP.trim()) {
      localStorage.setItem('christmas-tree-server-ip', serverIP.trim());
    }
    
    setShowQRModal(true);
    setIsConnecting(true);
    setConnectionStatus("connecting");

    const ip = serverIP.trim() || detectedIP || window.location.hostname;
    
    // 端口配置：从环境变量读取，开发者配置
    const isDev = import.meta.env.DEV;
    const wsPort = import.meta.env.VITE_WS_PORT || (isDev ? "8081" : (window.location.port || "8080"));
    const httpPort = window.location.port || import.meta.env.VITE_HTTP_PORT || "8080";
    
    // WebSocket 协议：根据页面协议选择（HTTPS 页面必须使用 WSS）
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";

    console.log('[Connection] Using IP:', ip);
    console.log('[Connection] WebSocket port:', wsPort);
    console.log('[Connection] HTTP port:', httpPort);
    console.log('[Connection] Protocol:', protocol);

    try {
      // 连接 WebSocket
      const wsUrl = `${protocol}://${ip}:${wsPort}/ws?room=${roomId}`;
      console.log('[Connection] Connecting to WebSocket:', wsUrl);
      
      // 创建 WebSocket 连接
      // 注意：对于自签名证书，浏览器可能会阻止连接
      // 如果使用自签名证书，需要在浏览器中先访问 https://[IP]:8081 并信任证书
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      console.log('[Connection] WebSocket created, readyState:', ws.readyState);

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setConnectionStatus("signaling");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Connection] Received message:', data.type);
          await handleSignaling(data);
        } catch (error) {
          console.error('[Connection] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        console.error("❌ Failed to connect to:", wsUrl);
        setConnectionStatus("error");
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus("disconnected");
        
        // 连接丢失时，自动切回本地摄像头（使用 ref 获取最新状态）
        if (isRemoteCameraRef.current) {
          console.log('[Camera] Connection lost, auto-switching back to local camera');
          setVideoReady(false); // 先重置，确保 MediaPipe 重新初始化
          setIsRemoteCamera(false);
          isRemoteCameraRef.current = false;
          
          // 等待切换完成后重新启用本地摄像头的 MediaPipe
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              setVideoReady(true);
              console.log('[Camera] Switched back to local camera, MediaPipe enabled');
              console.log('[Camera] MediaPipe should now be processing local video');
            }
          }, 300);
        }
        
        // 如果非正常关闭，尝试重连
        if (event.code !== 1000 && isConnecting) {
          console.log("Attempting to reconnect...");
          setTimeout(() => {
            if (isConnecting) {
              connectPhoneCamera();
            }
          }, 3000);
        }
      };

      // 创建 RTCPeerConnection
      await setupPeerConnection();
    } catch (error) {
      console.error("Connection error:", error);
      setIsConnecting(false);
      setConnectionStatus("error");
    }
  }

  async function setupPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      console.log("📹 Desktop received remote track");
      console.log("📹 Track kind:", event.track.kind);
      console.log("📹 Streams count:", event.streams.length);
      console.log("📹 Remote video ref exists:", !!remoteVideoRef.current);
      
      if (event.streams && event.streams.length > 0) {
        const stream = event.streams[0];
        console.log("📹 Stream tracks:", stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
        
        // 设置连接状态
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionStatus("connected");
        setShowQRModal(false); // 连接成功后关闭二维码弹窗
        
        // 立即切换到远程摄像头（不等待视频加载完成）
        console.log('[Camera] Auto-switching to remote camera (immediate)');
        setVideoReady(false); // 先重置，确保 MediaPipe 重新初始化
        setIsRemoteCamera(true);
        isRemoteCameraRef.current = true;
        
        // 等待视频元素存在后再设置 stream
        const setStream = () => {
          if (remoteVideoRef.current) {
            console.log("📹 Setting stream to video element");
            remoteVideoRef.current.srcObject = stream;
            
            // 等待远程视频准备好
            remoteVideoRef.current.onloadedmetadata = () => {
              console.log('[Camera] Remote camera ready');
              console.log('[Camera] Remote video dimensions:', remoteVideoRef.current?.videoWidth, 'x', remoteVideoRef.current?.videoHeight);
              
              // 确保视频播放
              remoteVideoRef.current?.play().catch(err => {
                console.error('[Camera] Error playing remote video:', err);
              });
              
              // 等待一下确保视频元素完全准备好，然后启用 MediaPipe
              setTimeout(() => {
                if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 2 && remoteVideoRef.current.videoWidth > 0) {
                  setVideoReady(true);
                  console.log('[Camera] Video ready, MediaPipe enabled for remote camera');
                  console.log('[Camera] MediaPipe should now be processing remote video');
                } else {
                  console.warn('[Camera] Remote video not fully ready yet, retrying...');
                  // 重试
                  setTimeout(() => {
                    if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 2 && remoteVideoRef.current.videoWidth > 0) {
                      setVideoReady(true);
                      console.log('[Camera] Video ready after retry, MediaPipe enabled for remote camera');
                    }
                  }, 500);
                }
              }, 500);
            };
            
            // 确保视频播放
            remoteVideoRef.current.oncanplay = () => {
              console.log('[Camera] Remote video can play');
              remoteVideoRef.current?.play().catch(err => {
                console.error('[Camera] Error playing remote video:', err);
              });
            };
            
            remoteVideoRef.current.onerror = (error) => {
              console.error('[Camera] Remote video error:', error);
            };
          } else {
            console.warn("📹 Video element not ready, retrying...");
            // 如果视频元素还不存在，等待一下再重试
            setTimeout(setStream, 100);
          }
        };
        
        // 立即尝试设置，如果元素不存在则等待
        setStream();
      } else {
        console.error("📹 No streams in track event");
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setConnectionStatus("connected");
      } else if (pc.connectionState === "failed") {
        setConnectionStatus("error");
        // 连接失败时，切回本地摄像头（使用 ref 获取最新状态）
        if (isRemoteCameraRef.current) {
          console.log('[Camera] WebRTC connection failed, auto-switching back to local camera');
          setIsRemoteCamera(false);
          isRemoteCameraRef.current = false;
          setVideoReady(false);
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              setVideoReady(true);
              console.log('[Camera] Switched back to local camera after connection failure');
            }
          }, 200);
        }
      } else if (pc.connectionState === "disconnected") {
        setIsConnected(false);
        setConnectionStatus("disconnected");
        // 连接断开时，切回本地摄像头（使用 ref 获取最新状态）
        if (isRemoteCameraRef.current) {
          console.log('[Camera] WebRTC connection disconnected, auto-switching back to local camera');
          setVideoReady(false); // 先重置，确保 MediaPipe 重新初始化
          setIsRemoteCamera(false);
          isRemoteCameraRef.current = false;
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              setVideoReady(true);
              console.log('[Camera] Switched back to local camera after disconnection');
              console.log('[Camera] MediaPipe should now be processing local video');
            }
          }, 300);
        }
      } else if (pc.connectionState === "closed") {
        setIsConnected(false);
        setConnectionStatus("disconnected");
        // 连接关闭时，切回本地摄像头（使用 ref 获取最新状态）
        if (isRemoteCameraRef.current) {
          console.log('[Camera] WebRTC connection closed, auto-switching back to local camera');
          setVideoReady(false); // 先重置，确保 MediaPipe 重新初始化
          setIsRemoteCamera(false);
          isRemoteCameraRef.current = false;
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              setVideoReady(true);
              console.log('[Camera] Switched back to local camera after connection closed');
              console.log('[Camera] MediaPipe should now be processing local video');
            }
          }, 300);
        }
      }
    };
    
    // 监听 ICE 连接状态变化
    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        setIsConnected(false);
        setConnectionStatus("disconnected");
        // ICE 连接断开时，切回本地摄像头（使用 ref 获取最新状态）
        if (isRemoteCameraRef.current) {
          console.log('[Camera] ICE connection lost, auto-switching back to local camera');
          setVideoReady(false); // 先重置，确保 MediaPipe 重新初始化
          setIsRemoteCamera(false);
          isRemoteCameraRef.current = false;
          setTimeout(() => {
            if (localVideoRef.current && localVideoRef.current.readyState >= 2 && localVideoRef.current.videoWidth > 0) {
              setVideoReady(true);
              console.log('[Camera] Switched back to local camera after ICE connection lost');
              console.log('[Camera] MediaPipe should now be processing local video');
            }
          }, 300);
        }
      }
    };

    // 桌面端作为接收方，等待手机端发送 offer
    // 不需要主动创建 offer，等待 handleSignaling 处理手机端的 offer
    console.log("🖥️ Desktop waiting for phone offer...");
  }

  async function handleSignaling(data: any) {
    const pc = pcRef.current;
    if (!pc) {
      console.warn("🖥️ PeerConnection not ready, ignoring message:", data.type);
      return;
    }

    try {
      // 忽略欢迎消息
      if (data.type === "welcome") {
        console.log("🖥️ Received welcome message");
        return;
      }

      if (data.type === "offer") {
        // 桌面端收到手机端的 offer，创建 answer
        console.log("🖥️ Desktop received offer from phone");
        console.log("🖥️ Desktop PC state before setRemoteDescription:", {
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          localDescription: pc.localDescription?.type,
          remoteDescription: pc.remoteDescription?.type
        });
        
        // 检查状态：只有在 stable 或 have-local-offer 状态下才能设置 remote offer
        if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") {
          console.error("🖥️ Desktop PC is not in 'stable' or 'have-local-offer' state, current state:", pc.signalingState);
          setConnectionStatus("error");
          return;
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        console.log("🖥️ Desktop set remote description (offer)");
        console.log("🖥️ Desktop PC state after setRemoteDescription:", pc.signalingState);
        
        // 处理缓存的 ICE candidates（现在 remote description 已设置）
        while (pendingIceCandidatesRef.current.length > 0) {
          const pendingCandidate = pendingIceCandidatesRef.current.shift();
          if (pendingCandidate) {
            try {
              await pc.addIceCandidate(pendingCandidate);
              console.log("🖥️ Desktop added pending ICE candidate after setting remote description");
            } catch (error) {
              console.error("🖥️ Error adding pending ICE candidate:", error);
            }
          }
        }
        
        const answer = await pc.createAnswer({
          offerToReceiveVideo: true, // 桌面端接收视频
          offerToReceiveAudio: false,
        });
        await pc.setLocalDescription(answer);
        console.log("🖥️ Desktop created answer, sending to phone");
        console.log("🖥️ Desktop PC state after setLocalDescription:", pc.signalingState);
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(answer));
          console.log("🖥️ Desktop answer sent successfully");
        } else {
          console.error("🖥️ WebSocket not ready, cannot send answer");
        }
      } else if (data.type === "ice-candidate") {
        // 添加 ICE candidate
        if (data.candidate) {
          console.log("🖥️ Desktop received ICE candidate from phone");
          const candidate = new RTCIceCandidate(data.candidate);
          
          // 检查 remote description 是否已设置
          if (!pc.remoteDescription) {
            console.log("🖥️ Desktop remote description not set yet, caching ICE candidate");
            pendingIceCandidatesRef.current.push(candidate);
            return;
          }
          
          try {
            await pc.addIceCandidate(candidate);
            console.log("🖥️ Desktop added ICE candidate");
            
            // 处理缓存的 ICE candidates
            while (pendingIceCandidatesRef.current.length > 0) {
              const pendingCandidate = pendingIceCandidatesRef.current.shift();
              if (pendingCandidate) {
                try {
                  await pc.addIceCandidate(pendingCandidate);
                  console.log("🖥️ Desktop added pending ICE candidate");
                } catch (error) {
                  console.error("🖥️ Error adding pending ICE candidate:", error);
                }
              }
            }
          } catch (error) {
            console.error("🖥️ Error adding ICE candidate:", error);
            // 如果添加失败，缓存起来稍后重试
            pendingIceCandidatesRef.current.push(candidate);
          }
        }
      } else {
        console.log("🖥️ Desktop received unknown message type:", data.type);
      }
    } catch (error) {
      console.error("🖥️ Signaling error:", error);
      setConnectionStatus("error");
    }
  }

  function switchCamera() {
    const newIsRemote = !isRemoteCamera;
    console.log('[Camera] Switching camera:', newIsRemote ? 'remote' : 'local');
    
    setVideoReady(false); // 切换时重置状态
    setIsRemoteCamera(newIsRemote);
    isRemoteCameraRef.current = newIsRemote; // 同步更新 ref
    
    // 等待切换完成后重新启用 MediaPipe
    setTimeout(() => {
      const video = newIsRemote ? remoteVideoRef.current : localVideoRef.current;
      console.log('[Camera] Checking video after switch:', {
        isRemote: newIsRemote,
        videoExists: !!video,
        readyState: video?.readyState,
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight
      });
      
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        setVideoReady(true);
        console.log('[Camera] Switched camera, MediaPipe enabled');
      } else {
        console.warn('[Camera] Video not ready after switch, waiting...');
        // 如果视频还没准备好，再等待一下
        setTimeout(() => {
          const checkVideo = newIsRemote ? remoteVideoRef.current : localVideoRef.current;
          if (checkVideo && checkVideo.readyState >= 2 && checkVideo.videoWidth > 0) {
            setVideoReady(true);
            console.log('[Camera] Video ready after retry, MediaPipe enabled');
          }
        }, 500);
      }
    }, 200);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        // 通知 ChristmasTree 组件添加照片
        window.dispatchEvent(new CustomEvent('add-photo', { detail: { imageUrl } }));
      };
      reader.readAsDataURL(file);
    });
    
    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="app-container">
      <ChristmasTree 
        mode={handState.mode} 
        handPosition={{ x: handState.x, y: handState.y }}
        handDetected={handState.detected}
      />

      {/* Background Music */}
      <audio ref={bgmRef} src="/bgm.mp3" loop />

      {/* Title Overlay */}
      <div className={`ui-layer ${uiHidden ? 'ui-hidden' : ''}`}>
        <h1 className="title">Merry Christmas 小秋秋</h1>
        <div className="gesture-hint">
          {handState.detected ? (
            <span className="gesture-mode">
              {handState.mode === 'TREE' && '🎄 Tree Mode'}
              {handState.mode === 'SCATTER' && '✨ Scatter Mode'}
              {handState.mode === 'FOCUS' && '🔍 Focus Mode'}
            </span>
          ) : (
            <span className="gesture-waiting">Show your hand to control</span>
          )}
        </div>
        
        {/* Upload Button */}
        <div className="upload-wrapper">
          <label className="upload-btn">
            Add Memories
            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <div className="hint-text">Press 'H' to Hide Controls</div>
        </div>
      </div>

      {/* Camera Button - Bottom Floating */}
      <div className="camera-button-container">
        <button className="camera-btn-main" onClick={connectPhoneCamera}>
          <span className="camera-icon">📱</span>
          连接手机摄像头
        </button>
        {isConnected && (
          <div style={{ marginTop: '10px', textAlign: 'center' }}>
            <button 
              onClick={switchCamera} 
              className="toggle-control-btn"
            >
              切换控制: <span>{isRemoteCamera ? '手机摄像头' : '电脑摄像头'}</span>
            </button>
          </div>
        )}
      </div>

          {showQRModal && (
            <div className="qr-modal" onClick={(e) => {
              if (e.target === e.currentTarget) setShowQRModal(false);
            }}>
              <div className="qr-content">
                <h3>Connect Phone Camera</h3>
                
                <div className="connection-status">
                  <div className="status-text">
                    {connectionStatus === "connecting" && "🔄 Waiting for connection..."}
                    {connectionStatus === "signaling" && "📡 Connecting to phone..."}
                    {connectionStatus === "connected" && "✅ Phone connected! 📱"}
                    {connectionStatus === "error" && "❌ Connection failed"}
                  </div>
                  <div className="room-display">{roomId}</div>
                </div>
                
                <div className="ip-config">
                  <label className="ip-label">Server IP Configuration</label>
                  <input
                    type="text"
                    value={serverIP}
                    onChange={(e) => setServerIP(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        connectPhoneCamera();
                      }
                    }}
                    className="ip-input"
                    placeholder={detectedIP || "192.168.1.100"}
                  />
                  <div className="ip-hint">Enter your server's IP address. Leave empty to use current host.</div>
                  
                  <button className="update-btn" onClick={connectPhoneCamera}>
                    Update QR Code
                  </button>
                </div>
                
                <div className="qr-code">
                  <canvas ref={qrCanvasRef}></canvas>
                </div>
                <p className="connection-url">
                  <strong>Room Code:</strong> {roomId}<br />
                  <small>
                    Server: {(() => {
                      const ip = serverIP.trim() || detectedIP || window.location.hostname;
                      const httpPort = window.location.port || import.meta.env.VITE_HTTP_PORT || (window.location.protocol === 'https:' ? '443' : '8080');
                      return httpPort && httpPort !== '443' && httpPort !== '80' 
                        ? `${ip}:${httpPort}` 
                        : ip;
                    })()}
                  </small>
                </p>
                <button className="update-btn" onClick={connectPhoneCamera}>
                  🔄 Refresh QR
                </button>
                <button className="close-btn" onClick={() => setShowQRModal(false)}>
                  Close
                </button>
              </div>
            </div>
          )}

      {/* Camera Video Container - 左下角显示摄像头画面（本地或远程） */}
      {/* 本地摄像头：始终显示；远程摄像头：连接后显示 */}
      <div className={`remote-video-container ${(isRemoteCamera ? isConnected : true) ? 'active' : ''}`}>
        {/* 根据 isRemoteCamera 状态显示对应的视频元素 */}
        {isRemoteCamera ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
          />
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
          />
        )}
      </div>
    </div>
  );
}
