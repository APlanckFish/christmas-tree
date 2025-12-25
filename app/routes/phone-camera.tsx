import type { MetaFunction } from "react-router";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router";
import "./phone-camera.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Phone Camera - Christmas Tree" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
};

export default function PhoneCamera() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("room");

  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>("new");

  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);

  useEffect(() => {
    if (!roomId) {
      setError("No room ID provided. Please scan QR code again.");
      return;
    }

    initializeCamera();

    return () => {
      cleanup();
    };
  }, [roomId]);

  async function initializeCamera() {
    try {
      setStatus("Requesting camera permission...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStatus("Camera ready! Connecting...");
      await setupConnection();
    } catch (err: any) {
      console.error("Camera error:", err);
      let errorMsg = "Camera error: ";

      if (err.name === "NotAllowedError") {
        errorMsg = "Camera permission denied. Please allow camera access.";
      } else if (err.name === "NotFoundError") {
        errorMsg = "No camera found on this device.";
      } else if (err.name === "NotReadableError") {
        errorMsg = "Camera is already in use by another application.";
      } else {
        errorMsg += err.message;
      }

      setError(errorMsg);
    }
  }

  async function setupConnection() {
    // WebSocket 协议：根据页面协议选择（HTTPS 页面必须使用 WSS）
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    
    // 使用 hostname，如果是 localhost 则尝试使用当前 host
    let host = window.location.hostname;
    
    // 如果 hostname 是 localhost 或 127.0.0.1，尝试从 URL 参数获取服务器 IP
    const urlParams = new URLSearchParams(window.location.search);
    const serverIP = urlParams.get('server');
    if (serverIP) {
      host = serverIP;
      console.log('[Phone Camera] Using server IP from URL:', host);
    }
    
    // 端口配置：从环境变量读取，开发者配置
    const isDev = import.meta.env.DEV;
    const isProduction = !isDev && window.location.protocol === "https:";
    
    // 如果是生产环境（HTTPS），通过 Nginx 反向代理，不需要端口号
    // 如果是开发环境或 HTTP，需要端口号
    const wsPort = isProduction 
      ? "" 
      : (import.meta.env.VITE_WS_PORT || (isDev ? "8081" : (window.location.port || "8080")));
    
    // 生产环境：wss://domain.com/ws
    // 开发环境：ws://ip:port/ws
    const wsUrl = wsPort 
      ? `${protocol}://${host}:${wsPort}/ws?room=${roomId}`
      : `${protocol}://${host}/ws?room=${roomId}`;
    console.log('[Phone Camera] Connecting to WebSocket:', wsUrl);
    console.log('[Phone Camera] Hostname:', host, 'Port:', wsPort || 'none (via Nginx)', 'Protocol:', protocol);
    console.log('[Phone Camera] Production mode:', isProduction);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setStatus("WebSocket connected, setting up WebRTC...");
        setError(""); // 清除之前的错误
        setupWebRTC();
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Phone Camera] Received message:', data.type);
          await handleSignaling(data);
        } catch (error) {
          console.error('[Phone Camera] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        console.error("❌ Failed to connect to:", wsUrl);
        setError(`WebSocket connection failed. Please check:\n1. Server is running on port ${wsPort}\n2. Network connection\n3. Firewall settings`);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        setStatus("Connection closed");
        setIsStreaming(false);
        
        if (event.code === 1006) {
          // 1006 表示异常关闭，可能是服务器未启动或网络问题
          setError(`Connection closed unexpectedly (code: ${event.code}).\nPossible causes:\n1. WebSocket server not running on port ${wsPort}\n2. Network/firewall blocking connection\n3. Server IP incorrect`);
        } else if (event.code !== 1000) {
          setError(`Connection closed (code: ${event.code}${event.reason ? ': ' + event.reason : ''})`);
        }
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket:", error);
      setError(`Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function setupWebRTC() {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pcRef.current = pc;

    // 添加本地流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current!);
      });
    }

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

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Connection state:", state);
      setConnectionState(state);
      
      if (state === "connected") {
        setStatus("✅ Connected! Streaming video...");
        setIsStreaming(true);
      } else if (state === "failed") {
        setError("Connection failed");
        setIsStreaming(false);
      } else if (state === "disconnected") {
        setStatus("Connection disconnected");
        setIsStreaming(false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log("ICE connection state:", state);
      setIceConnectionState(state);
      
      if (state === "connected") {
        setStatus("✅ Connected! Streaming video...");
      } else if (state === "failed") {
        setError("ICE connection failed");
      }
    };

    // 创建 offer (手机端作为发起方)
    try {
      console.log("📱 Phone creating offer...");
      console.log("📱 Phone PC state before createOffer:", {
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState
      });
      
      const offer = await pc.createOffer({
        offerToReceiveVideo: false, // 手机端只发送，不接收
        offerToReceiveAudio: false,
      });
      
      console.log("📱 Phone offer created, setting local description...");
      await pc.setLocalDescription(offer);
      console.log("📱 Phone set local description (offer)");
      
      // 等待状态更新（setLocalDescription 是异步的，状态更新可能有延迟）
      let retries = 0;
      while (pc.signalingState !== "have-local-offer" && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 50));
        retries++;
      }
      
      console.log("📱 Phone PC state after setLocalDescription:", {
        signalingState: pc.signalingState,
        localDescription: pc.localDescription?.type,
        retries: retries
      });
      
      // 验证状态
      if (pc.signalingState !== "have-local-offer") {
        console.error("📱 Phone PC state is not 'have-local-offer' after setLocalDescription:", pc.signalingState);
        setError(`Failed to set local offer. State: ${pc.signalingState}`);
        return;
      }
      
      console.log("📱 Phone sending offer to desktop...");
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(offer));
        console.log("📱 Phone offer sent successfully");
      } else {
        console.error("📱 WebSocket not ready, cannot send offer");
        setError("WebSocket not connected");
      }
    } catch (error) {
      console.error("Error creating offer:", error);
      setError(`Failed to create WebRTC offer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleSignaling(data: any) {
    const pc = pcRef.current;
    if (!pc) {
      console.warn("📱 PeerConnection not ready, ignoring message:", data.type);
      return;
    }

    try {
      // 忽略欢迎消息
      if (data.type === "welcome") {
        console.log("📱 Received welcome message");
        return;
      }

      if (data.type === "answer") {
        console.log("📱 Phone received answer from desktop");
        console.log("📱 Phone PC state before setRemoteDescription:", {
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          localDescription: pc.localDescription?.type,
          remoteDescription: pc.remoteDescription?.type
        });
        
        // 检查状态：只有在 have-local-offer 状态下才能设置 answer
        // 如果状态不对，可能是时序问题，等待一下再重试
        if (pc.signalingState !== "have-local-offer") {
          console.warn("📱 Phone PC is not in 'have-local-offer' state, current state:", pc.signalingState);
          
          // 如果状态是 stable，可能是 offer 还没设置完成，等待一下
          if (pc.signalingState === "stable") {
            console.log("📱 Phone PC is in 'stable' state, checking local description...");
            // 检查是否有 local description
            if (!pc.localDescription || pc.localDescription.type !== "offer") {
              console.error("📱 Phone PC has no local offer, cannot set remote answer");
              setError("Offer not set yet. Please wait and try again.");
              return;
            }
            // 如果已经有 local offer，可能是状态更新延迟，尝试重新设置 local description
            console.log("📱 Phone PC has local offer but state is stable, re-setting local description...");
            try {
              await pc.setLocalDescription(pc.localDescription);
              // 等待状态更新
              let retries = 0;
              while (pc.signalingState !== "have-local-offer" && retries < 10) {
                await new Promise(resolve => setTimeout(resolve, 50));
                retries++;
              }
              console.log("📱 Phone PC state after re-setting local description:", pc.signalingState);
              if (pc.signalingState !== "have-local-offer") {
                console.error("📱 Phone PC still not in 'have-local-offer' state after retry");
                setError(`Failed to set local offer. State: ${pc.signalingState}`);
                return;
              }
            } catch (error) {
              console.error("📱 Error re-setting local description:", error);
              setError(`Failed to set local offer: ${error instanceof Error ? error.message : String(error)}`);
              return;
            }
          } else {
            console.error("📱 Phone PC is in unexpected state:", pc.signalingState);
            setError(`Invalid signaling state: ${pc.signalingState}. Expected: have-local-offer`);
            return;
          }
        }
        
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          console.log("📱 Phone set remote description (answer)");
          console.log("📱 Phone PC state after setRemoteDescription:", pc.signalingState);
          
          // 处理缓存的 ICE candidates（现在 remote description 已设置）
          while (pendingIceCandidatesRef.current.length > 0) {
            const pendingCandidate = pendingIceCandidatesRef.current.shift();
            if (pendingCandidate) {
              try {
                await pc.addIceCandidate(pendingCandidate);
                console.log("📱 Phone added pending ICE candidate after setting remote description");
              } catch (error) {
                console.error("📱 Error adding pending ICE candidate:", error);
              }
            }
          }
        } catch (error) {
          console.error("📱 Error setting remote description (answer):", error);
          // 如果是状态错误，可能是时序问题，记录但不阻止
          if (error instanceof Error && error.message.includes("state")) {
            console.warn("📱 State error, but continuing...");
            // 尝试重新设置 local description 然后重试
            if (pc.localDescription && pc.localDescription.type === "offer") {
              console.log("📱 Retrying with current local description...");
              try {
                await pc.setLocalDescription(pc.localDescription);
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                console.log("📱 Phone set remote description (answer) after retry");
              } catch (retryError) {
                console.error("📱 Retry failed:", retryError);
                setError(`Failed to set remote answer: ${error instanceof Error ? error.message : String(error)}`);
              }
            } else {
              setError(`Failed to set remote answer: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            throw error;
          }
        }
      } else if (data.type === "ice-candidate") {
        if (data.candidate) {
          console.log("📱 Phone received ICE candidate from desktop");
          const candidate = new RTCIceCandidate(data.candidate);
          
          // 检查 remote description 是否已设置
          if (!pc.remoteDescription) {
            console.log("📱 Phone remote description not set yet, caching ICE candidate");
            pendingIceCandidatesRef.current.push(candidate);
            return;
          }
          
          try {
            await pc.addIceCandidate(candidate);
            console.log("📱 Phone added ICE candidate");
            
            // 处理缓存的 ICE candidates
            while (pendingIceCandidatesRef.current.length > 0) {
              const pendingCandidate = pendingIceCandidatesRef.current.shift();
              if (pendingCandidate) {
                try {
                  await pc.addIceCandidate(pendingCandidate);
                  console.log("📱 Phone added pending ICE candidate");
                } catch (error) {
                  console.error("📱 Error adding pending ICE candidate:", error);
                }
              }
            }
          } catch (error) {
            console.error("📱 Error adding ICE candidate:", error);
            // 如果添加失败，缓存起来稍后重试
            pendingIceCandidatesRef.current.push(candidate);
          }
        }
      } else {
        console.log("📱 Phone received unknown message type:", data.type);
      }
    } catch (error) {
      console.error("📱 Signaling error:", error);
      setError(`Signaling error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function cleanup() {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  }

  function stopStreaming() {
    cleanup();
    setStatus("Streaming stopped");
    setIsStreaming(false);

    setTimeout(() => {
      if (confirm("Start streaming again?")) {
        initializeCamera();
      }
    }, 1000);
  }

  return (
    <div className="phone-camera-container">
      <h2>🎄 Christmas Tree Camera 🎄</h2>

      {/* 连接状态信息 */}
      <div className="connection-info">
        <div className="info-item">
          <span className="info-label">房间ID:</span>
          <span className="info-value">{roomId || "N/A"}</span>
        </div>
        <div className="info-item">
          <span className="info-label">连接状态:</span>
          <span className={`info-value status-${connectionState}`}>
            {connectionState === "new" && "🔄 新建"}
            {connectionState === "connecting" && "🔄 连接中"}
            {connectionState === "connected" && "✅ 已连接"}
            {connectionState === "disconnected" && "❌ 已断开"}
            {connectionState === "failed" && "❌ 连接失败"}
            {connectionState === "closed" && "🔒 已关闭"}
          </span>
        </div>
        <div className="info-item">
          <span className="info-label">ICE 状态:</span>
          <span className={`info-value status-${iceConnectionState}`}>
            {iceConnectionState === "new" && "🔄 新建"}
            {iceConnectionState === "checking" && "🔍 检查中"}
            {iceConnectionState === "connected" && "✅ 已连接"}
            {iceConnectionState === "completed" && "✅ 完成"}
            {iceConnectionState === "failed" && "❌ 失败"}
            {iceConnectionState === "disconnected" && "❌ 断开"}
            {iceConnectionState === "closed" && "🔒 关闭"}
          </span>
        </div>
      </div>

      {/* 视频小窗 */}
      <div className="video-wrapper">
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="video-overlay">
          <div className="room-badge">Room: {roomId}</div>
          <div className={`connection-indicator ${isStreaming ? 'connected' : ''}`}>
            {isStreaming ? '📡' : '⏳'}
          </div>
        </div>
      </div>

      {/* 状态消息 */}
      {error ? (
        <div className="error-box">{error}</div>
      ) : (
        <div className="status-box">{status}</div>
      )}

      {/* 控制按钮 */}
      <div className="controls">
        {isStreaming && (
          <button onClick={stopStreaming} className="control-btn">
            Stop Streaming
          </button>
        )}
        {error && (
          <button onClick={initializeCamera} className="control-btn retry">
            🔄 Retry
          </button>
        )}
      </div>
    </div>
  );
}
