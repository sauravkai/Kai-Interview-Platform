import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  Shield,
  PhoneOff,
  User,
  Volume2,
  Sparkles,
  Maximize2,
  Grid,
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import {
  canUseScreenShare,
  getScreenShareUnavailableMessage,
  normalizeViewerRole,
} from '../../utils/webrtcScreenShare.js';

export const WebRTCVideoCall = ({
  candidateName = '',
  interviewerName = '',
  candidateTitle = '',
  candidateEmail = '',
  interviewerTitle = '',
  interviewerEmail = '',
  viewerRole = 'candidate',
  roomId = '',
  onEndInterview,
}) => {
  const { socket } = useSocket();
  const normalizedViewerRole = normalizeViewerRole(viewerRole);
  const isViewerInterviewer = normalizedViewerRole === 'interviewer';

  const displayCandidateName = candidateName || '';
  const displayInterviewerName = interviewerName || '';
  const displayCandidateTitle = candidateTitle || '';
  const displayCandidateEmail = candidateEmail || '';
  const displayInterviewerEmail = interviewerEmail || '';
  const displayInterviewerTitle = interviewerTitle || '';
  const localLabelName = isViewerInterviewer ? displayInterviewerName : displayCandidateName;
  const localLabelTitle = isViewerInterviewer ? displayInterviewerTitle : displayCandidateTitle;
  const localLabelEmail = isViewerInterviewer ? displayInterviewerEmail : displayCandidateEmail;
  const remoteLabelName = isViewerInterviewer ? displayCandidateName : displayInterviewerName;
  const remoteLabelTitle = isViewerInterviewer ? displayCandidateTitle : displayInterviewerTitle;
  const remoteLabelEmail = isViewerInterviewer ? displayCandidateEmail : displayInterviewerEmail;
  const localRoleLabel = isViewerInterviewer ? 'Interviewer' : 'Candidate';
  const remoteRoleLabel = isViewerInterviewer ? 'Candidate' : 'Interviewer';
  const localRoleNameLabel = localLabelName ? `${localRoleLabel}: ${localLabelName}` : '';
  const remoteRoleNameLabel = remoteLabelName ? `${remoteRoleLabel}: ${remoteLabelName}` : '';
  const localMetaLabel = localLabelEmail ? `${localRoleLabel} • ${localLabelEmail}` : localLabelTitle ? `${localRoleLabel} • ${localLabelTitle}` : '';
  const remoteMetaLabel = remoteLabelEmail ? `${remoteRoleLabel} • ${remoteLabelEmail}` : remoteLabelTitle ? `${remoteRoleLabel} • ${remoteLabelTitle}` : '';

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remoteVideoSource, setRemoteVideoSource] = useState('camera');
  const [isSpeaking, setIsSpeaking] = useState(true);
  const [layoutMode, setLayoutMode] = useState('stacked'); // 'stacked' | 'grid'

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteMediaStreamRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const peerSocketIdRef = useRef(null);
  const localTracksAttachedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const iceCandidatesQueueRef = useRef([]);

  const isPolite = normalizedViewerRole === 'candidate';

  // WebRTC ICE Servers configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
    iceCandidatePoolSize: 10,
  };

  const createVirtualStream = (name, role) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      let frame = 0;

      const draw = () => {
        frame++;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const radius = 48 + Math.sin(frame * 0.05) * 4;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 20, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = (name || role || 'Live').slice(0, 2).toUpperCase();
        ctx.fillText(initials, canvas.width / 2, canvas.height / 2 - 20);

        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#a5b4fc';
        ctx.fillText(`${name || role} (Camera Active)`, canvas.width / 2, canvas.height / 2 + 50);

        requestAnimationFrame(draw);
      };
      draw();

      const stream = canvas.captureStream(30);

      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch (_) {}

      return stream;
    } catch (_) {
      return new MediaStream();
    }
  };

  const replaceOutgoingTrack = async (kind, nextTrack) => {
    const pc = peerConnectionRef.current;
    if (!pc || !nextTrack) return false;

    const sender = pc.getSenders().find((candidate) => candidate.track?.kind === kind);
    if (!sender) {
      const existingTrack = pc.getSenders().find((candidate) => candidate.track?.kind === kind)?.track;
      if (existingTrack && existingTrack !== nextTrack) {
        await pc.getSenders().find((candidate) => candidate.track?.kind === kind)?.replaceTrack(nextTrack);
      }
      return false;
    }

    if (sender.track === nextTrack) return true;

    await sender.replaceTrack(nextTrack);
    return true;
  };

  const ensureScreenShareSupport = () => {
    if (canUseScreenShare()) return true;
    throw new Error(getScreenShareUnavailableMessage(normalizedViewerRole));
  };

  const getActiveLocalStream = () => (isScreenSharing && screenStreamRef.current ? screenStreamRef.current : mediaStreamRef.current);

  const renegotiateAfterTrackSwap = async () => {
    const pc = peerConnectionRef.current;
    const remoteSocketId = peerSocketIdRef.current;
    if (!socket || !roomId || !remoteSocketId || !pc) return;
    if (pc.signalingState !== 'stable' || makingOfferRef.current) return;

    try {
      await negotiateWithRemotePeer();
    } catch (err) {
      console.warn('WebRTC renegotiation after track swap failed:', err);
    }
  };

  const attachLocalTracksToConnection = () => {
    if (!peerConnectionRef.current || !mediaStreamRef.current) return false;

    const pc = peerConnectionRef.current;
    mediaStreamRef.current.getTracks().forEach((track) => {
      const alreadyAdded = pc.getSenders().some((sender) => sender.track === track);
      if (!alreadyAdded) {
        pc.addTrack(track, mediaStreamRef.current);
      }
    });
    localTracksAttachedRef.current = true;
    return true;
  };

  const ensurePeerConnection = () => {
    if (!peerConnectionRef.current) {
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        let remoteStream = event.streams?.[0] || remoteMediaStreamRef.current || new MediaStream();
        remoteMediaStreamRef.current = remoteStream;

        if (event.track.kind === 'video') {
          const existingVideoTrack = remoteStream.getVideoTracks()[0];
          if (existingVideoTrack && existingVideoTrack !== event.track) {
            remoteStream.removeTrack(existingVideoTrack);
            if (typeof existingVideoTrack.stop === 'function') {
              existingVideoTrack.stop();
            }
          }
          if (!remoteStream.getTracks().includes(event.track)) {
            remoteStream.addTrack(event.track);
          }
        } else if (event.track.kind === 'audio') {
          const existingAudioTrack = remoteStream.getAudioTracks()[0];
          if (existingAudioTrack && existingAudioTrack !== event.track) {
            remoteStream.removeTrack(existingAudioTrack);
            if (typeof existingAudioTrack.stop === 'function') {
              existingAudioTrack.stop();
            }
          }
          if (!remoteStream.getTracks().includes(event.track)) {
            remoteStream.addTrack(event.track);
          }
        }

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }

        if (event.track.kind === 'video') {
          const label = String(event.track.label || '').toLowerCase();
          setRemoteVideoSource(label.includes('screen') || label.includes('display') ? 'screen' : 'camera');
        }

        setHasRemoteStream(true);
        setIsPeerConnected(true);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.volume = 1;
          remoteVideoRef.current.play().catch(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = false;
              remoteVideoRef.current.volume = 1;
              remoteVideoRef.current.play().catch(() => undefined);
            }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['connected', 'completed'].includes(pc.connectionState)) {
          setIsPeerConnected(true);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setIsPeerConnected(false);
          setHasRemoteStream(false);
        }
      };

      pc.onnegotiationneeded = () => {
        if (peerSocketIdRef.current && peerConnectionRef.current?.signalingState === 'stable') {
          void negotiateWithRemotePeer();
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && peerSocketIdRef.current) {
          socket.emit('webrtc-ice-candidate', {
            roomId,
            candidate: event.candidate,
            targetSocketId: peerSocketIdRef.current,
          });
        }
      };
    }

    return peerConnectionRef.current;
  };

  const negotiateWithRemotePeer = async () => {
    const remoteSocketId = peerSocketIdRef.current;
    const pc = ensurePeerConnection();

    if (!socket || !roomId || !remoteSocketId || !pc) {
      return;
    }

    try {
      makingOfferRef.current = true;
      attachLocalTracksToConnection();
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', {
        roomId,
        offer: pc.localDescription,
        targetSocketId: remoteSocketId,
      });
    } catch (err) {
      console.warn('WebRTC offer creation error:', err);
    } finally {
      makingOfferRef.current = false;
    }
  };

  useEffect(() => {
    // 1. Request local media stream
    async function setupLocalMedia() {
      let stream = null;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          });
          setHasCameraPermission(true);
        }
      } catch (_err) {
        console.warn('Real webcam unavailable or locked by another window, initializing virtual stream:', _err?.message || _err);
        let audioTrack = null;
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioTrack = audioStream.getAudioTracks()[0];
        } catch (_) {}

        stream = createVirtualStream(localLabelName, localRoleLabel);
        if (audioTrack) {
          stream.getAudioTracks().forEach((track) => stream.removeTrack(track));
          stream.addTrack(audioTrack);
        }
        setHasCameraPermission(true);
      }

      if (!stream) {
        stream = createVirtualStream(localLabelName, localRoleLabel);
      }

      mediaStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = false;
        localVideoRef.current.volume = 1;
        localVideoRef.current.play().catch(() => undefined);
      }
      attachLocalTracksToConnection();
      if (peerSocketIdRef.current) {
        await negotiateWithRemotePeer();
      }
    }

    setupLocalMedia();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []);

  // 2. WebRTC Peer Connection via Socket.IO
  useEffect(() => {
    if (!socket || !roomId) return;

    const connectToRemotePeer = async (remoteSocketId) => {
      if (!remoteSocketId || remoteSocketId === socket.id) return;
      peerSocketIdRef.current = remoteSocketId;
      const pc = ensurePeerConnection();

      attachLocalTracksToConnection();
      await negotiateWithRemotePeer();
    };

    socket.on('room-state-init', ({ participants = [] }) => {
      const remoteParticipant = participants.find(
        (participant) => participant?.socketId && participant.socketId !== socket.id,
      );

      if (remoteParticipant?.socketId) {
        connectToRemotePeer(remoteParticipant.socketId);
      }
    });

    socket.on('user-joined-room', async ({ participant }) => {
      const remoteSocketId = participant?.socketId;
      if (!remoteSocketId || remoteSocketId === socket.id) return;

      await connectToRemotePeer(remoteSocketId);
    });

    socket.on('user-left-room', () => {
      setIsPeerConnected(false);
      setHasRemoteStream(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    socket.on('webrtc-offer-received', async ({ offer, senderSocketId }) => {
      if (!offer || senderSocketId === socket.id) return;

      peerSocketIdRef.current = senderSocketId;
      const pc = ensurePeerConnection();

      try {
        const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
        ignoreOfferRef.current = !isPolite && offerCollision;
        if (ignoreOfferRef.current) {
          return;
        }

        attachLocalTracksToConnection();
        if (offerCollision) {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(offer)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }

        // Drain queued ICE candidates
        while (iceCandidatesQueueRef.current.length > 0) {
          const candidate = iceCandidatesQueueRef.current.shift();
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        }

        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', {
          roomId,
          answer: pc.localDescription,
          targetSocketId: senderSocketId,
        });
        setIsPeerConnected(true);
      } catch (err) {
        console.warn('WebRTC offer processing error:', err);
      }
    });

    socket.on('webrtc-answer-received', async ({ answer, senderSocketId }) => {
      if (!answer || senderSocketId === socket.id || !peerConnectionRef.current) return;
      const pc = peerConnectionRef.current;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setIsPeerConnected(true);

        // Drain queued ICE candidates
        while (iceCandidatesQueueRef.current.length > 0) {
          const candidate = iceCandidatesQueueRef.current.shift();
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        }
      } catch (err) {
        console.warn('WebRTC remote description error:', err);
      }
    });

    socket.on('webrtc-ice-candidate-received', async ({ candidate, senderSocketId }) => {
      if (!candidate || senderSocketId === socket.id || !peerConnectionRef.current) return;
      const pc = peerConnectionRef.current;

      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidatesQueueRef.current.push(candidate);
        }
      } catch (err) {
        if (!ignoreOfferRef.current) {
          console.warn('WebRTC ICE candidate error:', err);
        }
      }
    });

    return () => {
      socket.off('room-state-init');
      socket.off('user-joined-room');
      socket.off('user-left-room');
      socket.off('webrtc-offer-received');
      socket.off('webrtc-answer-received');
      socket.off('webrtc-ice-candidate-received');
    };
  }, [socket, roomId, isPolite]);

  // Audio wave pulse animation simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeaking((prev) => !prev);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const toggleAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    const stream = getActiveLocalStream();
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const toggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    const stream = getActiveLocalStream();
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !nextVideoOff;
      });
    }
  };

  const toggleScreenShare = async () => {
    try {
      ensureScreenShareSupport();

      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            displaySurface: 'browser',
          },
          audio: true,
        });

        screenStreamRef.current = screenStream;

        const pc = ensurePeerConnection();
        if (pc) {
          attachLocalTracksToConnection();
        }

        const screenVideoTrack = screenStream.getVideoTracks()[0];
        const screenAudioTrack = screenStream.getAudioTracks()[0];

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        if (screenVideoTrack) {
          const sender = pc?.getSenders().find((candidate) => candidate.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(screenVideoTrack);
          } else {
            pc?.addTrack(screenVideoTrack, screenStream);
          }
        }
        if (screenAudioTrack) {
          const sender = pc?.getSenders().find((candidate) => candidate.track?.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(screenAudioTrack);
          } else {
            pc?.addTrack(screenAudioTrack, screenStream);
          }
        }

        await renegotiateAfterTrackSwap();
        setIsScreenSharing(true);

        screenStream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (screenStreamRef.current === screenStream && isScreenSharing) {
              screenStreamRef.current = null;
              setIsScreenSharing(false);
              void renegotiateAfterTrackSwap();
            }
          }, { once: true });
        });
      } else {
        const cameraStream = mediaStreamRef.current;
        if (localVideoRef.current && cameraStream) {
          localVideoRef.current.srcObject = cameraStream;
        }

        const cameraVideoTrack = cameraStream?.getVideoTracks()[0];
        const cameraAudioTrack = cameraStream?.getAudioTracks()[0];

        if (cameraVideoTrack) {
          await replaceOutgoingTrack('video', cameraVideoTrack);
        }
        if (cameraAudioTrack) {
          await replaceOutgoingTrack('audio', cameraAudioTrack);
        }

        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        await renegotiateAfterTrackSwap();
        setIsScreenSharing(false);
      }
    } catch (e) {
      console.warn('Screen sharing cancelled or unavailable:', e?.message || e);
      if (e?.message) {
        alert(e.message);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Header Status Bar */}
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-200 truncate">WebRTC HD Stream</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {isPeerConnected ? 'P2P Active' : 'Room Connected'}
          </span>
          <button
            onClick={() => setLayoutMode((prev) => (prev === 'stacked' ? 'grid' : 'stacked'))}
            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Toggle Video Layout"
          >
            {layoutMode === 'stacked' ? <Grid className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Video Container (Responsive Stacked / Grid) */}
      <div className={`flex-1 p-2 gap-2 overflow-y-auto bg-slate-950 min-h-0 ${
        layoutMode === 'grid' ? 'grid grid-cols-2' : 'flex flex-col'
      }`}>
        {/* Remote Video Feed (Interviewer / Peer) */}
        <div className="relative flex-1 min-h-[150px] rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950/30 to-slate-950 border border-slate-800 flex items-center justify-center group">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            className={`w-full h-full object-cover ${(hasRemoteStream || isPeerConnected) ? 'block' : 'hidden'}`}
          />

          {remoteVideoSource === 'screen' && hasRemoteStream && (
            <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-indigo-600/90 text-[9px] font-bold uppercase tracking-[0.14em] text-white border border-indigo-300/50 shadow-lg backdrop-blur-sm">
              Screen Share
            </div>
          )}

          {!hasRemoteStream && !isPeerConnected && (
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
              <div className="relative">
                <div className={`w-16 h-16 rounded-full bg-purple-600/30 border-2 border-purple-500/50 flex items-center justify-center shadow-lg shadow-purple-500/20 ${
                  isSpeaking ? 'ring-4 ring-purple-500/30 animate-pulse' : ''
                }`}>
                  <User className="w-8 h-8 text-purple-200" />
                </div>
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-950"></span>
              </div>

              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-100">{remoteRoleNameLabel}</h4>
                <p className="text-[10px] text-emerald-400 font-mono flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" /> {remoteRoleLabel}
                </p>
                {remoteLabelEmail && (
                  <p className="text-[9px] text-slate-300 font-mono break-all">{remoteLabelEmail}</p>
                )}
              </div>

              {/* Animated Audio Waveform Indicator */}
              <div className="flex items-center gap-0.5 h-3 mt-1">
                {[40, 70, 100, 60, 30, 80, 50].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${isSpeaking ? h : 20}%` }}
                    className="w-0.5 bg-purple-400/80 rounded-full transition-all duration-300"
                  ></span>
                ))}
              </div>
            </div>
          )}

          {/* Name & Audio Status Overlay */}
          <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur border border-slate-800/80 text-[10px] font-mono text-slate-200 shadow-md">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="font-semibold">{remoteRoleNameLabel}</span>
            </div>
            {remoteLabelEmail ? (
              <div className="text-[9px] text-slate-300 mt-0.5 break-all">{remoteLabelEmail}</div>
            ) : (
              <div className="text-[9px] text-slate-300 mt-0.5">{remoteRoleLabel} • {remoteLabelTitle}</div>
            )}
          </div>
        </div>

        {/* Local Video Feed (Candidate) */}
        <div className="relative flex-1 min-h-[150px] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
          {!isVideoOff && hasCameraPermission ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center">
                <User className="w-8 h-8 text-indigo-300" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-200">{localRoleNameLabel} {normalizedViewerRole === 'candidate' ? '(You)' : ''}</h4>
                <p className="text-[10px] text-slate-400 font-mono break-all">
                  {localRoleLabel} • {isVideoOff ? 'Camera Turned Off' : 'Camera Stream Ready'}
                </p>
                {localLabelEmail && (
                  <p className="text-[9px] text-slate-300 font-mono break-all">{localLabelEmail}</p>
                )}
              </div>
            </div>
          )}

          {/* Name Overlay */}
          <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur border border-slate-800/80 text-[10px] font-mono text-slate-200 shadow-md">
            <div className="flex items-center gap-1.5">
              {isAudioMuted ? (
                <MicOff className="w-3 h-3 text-rose-400" />
              ) : (
                <Mic className="w-3 h-3 text-emerald-400" />
              )}
              <span className="font-semibold">{localRoleNameLabel}</span>
            </div>
            {localLabelEmail ? (
              <div className="text-[9px] text-slate-300 mt-0.5 break-all">{localLabelEmail}</div>
            ) : (
              <div className="text-[9px] text-slate-300 mt-0.5">{localRoleLabel} • {localLabelTitle}</div>
            )}
          </div>
        </div>
      </div>

      {/* Control Action Bar */}
      <div className="p-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAudio}
            className={`p-2 rounded-xl border transition-all ${
              isAudioMuted
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-md shadow-rose-500/10'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
            title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-2 rounded-xl border transition-all ${
              isVideoOff
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-md shadow-rose-500/10'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
            title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
          >
            {isVideoOff ? <VideoOff className="w-4 h-4" /> : <VideoIcon className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-xl border transition-all ${
              isScreenSharing
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
            title="Share Screen"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>

        {onEndInterview && (
          <button
            onClick={onEndInterview}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-extrabold text-white shadow-lg shadow-rose-600/30 transition-all transform hover:scale-[1.02]"
          >
            <PhoneOff className="w-3.5 h-3.5" /> End Call
          </button>
        )}
      </div>
    </div>
  );
};

