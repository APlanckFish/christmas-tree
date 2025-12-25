export type Role = 'desktop' | 'phone';

export interface WebRTCConfig {
  roomId: string;
  role: Role;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (error: Error) => void;
}

export class WebRTCService {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private config: WebRTCConfig;
  private localStream: MediaStream | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: WebRTCConfig) {
    this.config = config;
  }

  async initialize(localStream?: MediaStream): Promise<void> {
    try {
      // Store local stream if provided
      if (localStream) {
        this.localStream = localStream;
      }

      // Connect to WebSocket signaling server
      await this.connectWebSocket();

      // Create peer connection
      this.createPeerConnection();

      // Add local stream tracks if available
      if (this.localStream && this.pc) {
        this.localStream.getTracks().forEach(track => {
          this.pc!.addTrack(track, this.localStream!);
        });
        console.log(`📹 Added ${this.localStream.getTracks().length} tracks to peer connection`);
      }

      // If phone (has local stream), create and send offer
      if (this.config.role === 'phone' && this.localStream) {
        await this.createAndSendOffer();
      }
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:3001/ws`;

      console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;

        // Join room
        this.sendMessage({
          type: 'join',
          roomId: this.config.roomId,
          role: this.config.role,
        });

        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        this.handleWebSocketClose();
      };

      // Timeout
      setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private handleWebSocketClose(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connectWebSocket().catch(console.error);
      }, 2000 * this.reconnectAttempts);
    } else {
      this.config.onError?.(new Error('WebSocket connection lost'));
    }
  }

  private createPeerConnection(): void {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    this.pc = new RTCPeerConnection(configuration);

    // ICE candidate handler
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate (${event.candidate.type})`);
        this.sendMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    // Connection state change
    this.pc.onconnectionstatechange = () => {
      const state = this.pc!.connectionState;
      console.log(`🔗 Connection state: ${state}`);
      this.config.onConnectionStateChange?.(state);
    };

    // ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state: ${this.pc!.iceConnectionState}`);
    };

    // Track handler (receive remote stream)
    this.pc.ontrack = (event) => {
      console.log(`📹 Received remote track:`, event.track.kind);
      if (event.streams && event.streams[0]) {
        console.log(`📺 Received remote stream with ${event.streams[0].getTracks().length} tracks`);
        this.config.onRemoteStream?.(event.streams[0]);
      }
    };
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;

    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('📤 Sending offer');
      this.sendMessage({
        type: 'offer',
        ...offer,
      });
    } catch (error) {
      console.error('Failed to create offer:', error);
      throw error;
    }
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    console.log(`📨 Received message:`, message.type);

    try {
      switch (message.type) {
        case 'joined':
          console.log(`✅ Joined room ${message.roomId} as ${message.role}`);
          break;

        case 'peer-joined':
          console.log(`👥 Peer joined: ${message.peerRole}`);
          // If desktop and peer is phone, wait for offer
          // If phone and peer is desktop, create offer
          if (this.config.role === 'phone' && message.peerRole === 'desktop') {
            await this.createAndSendOffer();
          }
          break;

        case 'offer':
          if (!this.pc) return;
          await this.pc.setRemoteDescription(new RTCSessionDescription(message));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          console.log('📤 Sending answer');
          this.sendMessage({
            type: 'answer',
            ...answer,
          });
          break;

        case 'answer':
          if (!this.pc) return;
          await this.pc.setRemoteDescription(new RTCSessionDescription(message));
          console.log('✅ Answer received and set');
          break;

        case 'ice-candidate':
          if (!this.pc) return;
          await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          console.log('🧊 ICE candidate added');
          break;

        case 'peer-left':
          console.log(`👋 Peer left: ${message.peerRole}`);
          this.config.onConnectionStateChange?.('disconnected');
          break;

        case 'error':
          console.error('Server error:', message.message);
          this.config.onError?.(new Error(message.message));
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
      this.config.onError?.(error as Error);
    }
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  close(): void {
    console.log('🛑 Closing WebRTC connection');

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState ?? null;
  }
}
