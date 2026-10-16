import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from '../../components/TopBar';
import Panel from '../../components/Panel';
import { useSocket } from '../../contexts/SocketContext';
import { usePolling } from '../../hooks/usePolling';
import { deliveryService } from '../../services/deliveryService';
import { safetyService } from '../../services/adminService';
import { useTranslation } from 'react-i18next';
import { detectHelmetInVideo } from '../../utils/helmetDetection';
import { extractErrorMessage } from '../../utils/errors';
import { Violation } from '../../types';

export default function Safety() {
  const { t } = useTranslation();
  const { isConnected } = useSocket();
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [speed, setSpeed] = useState(0);
  const [speedUpdatedAt, setSpeedUpdatedAt] = useState<string>('—');
  const [helmetDetected, setHelmetDetected] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [helmetConfidence, setHelmetConfidence] = useState(0);
  const [topScore, setTopScore] = useState(0);
  const [detectionLabel, setDetectionLabel] = useState('Waiting for camera...');
  const [warningCount, setWarningCount] = useState(0);
  const [warningLimit, setWarningLimit] = useState(5);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [safetyScore, setSafetyScore] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [safetyHistory, setSafetyHistory] = useState<Violation[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const detectBusyRef = useRef(false);
  const helmetStateRef = useRef(helmetDetected);
  const cameraStateRef = useRef(cameraActive);

  const speedLimit = 60;
  const isOver = speed > speedLimit;
  const offset = 377 - (377 * Math.min(speed / 100, 1));

  useEffect(() => {
    helmetStateRef.current = helmetDetected;
  }, [helmetDetected]);

  useEffect(() => {
    cameraStateRef.current = cameraActive;
  }, [cameraActive]);

  const syncSafetyState = useCallback((payload?: { helmet_detected?: boolean; camera_active?: boolean }) => {
    const state = payload ?? {
      helmet_detected: helmetStateRef.current,
      camera_active: cameraStateRef.current,
    };
    void deliveryService.updateMySafety(state).catch(() => null);
  }, []);

  const stopCamera = useCallback(() => {
    if (detectTimerRef.current) {
      window.clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    if (syncTimerRef.current) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectBusyRef.current = false;
    setDetecting(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraActive(false);
      setCameraError('Camera API not supported in this browser.');
      setDetectionLabel('Camera unavailable');
      syncSafetyState({ camera_active: false });
      return;
    }

    stopCamera();

    try {
      setCameraError('');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setCameraActive(true);
      setDetecting(true);
      setDetectionLabel('Analyzing helmet usage...');
      syncSafetyState({ camera_active: true });

      detectTimerRef.current = window.setInterval(() => {
        if (detectBusyRef.current || !videoRef.current) return;
        detectBusyRef.current = true;

        void detectHelmetInVideo(videoRef.current)
          .then((result) => {
            const detected = result.helmetDetected;
            setHelmetDetected(detected);
            setHelmetConfidence(result.confidence);
            setTopScore(result.topScore);
            if (result.topLabel === 'waiting_for_camera') {
              setDetectionLabel('Waiting for camera frame...');
            } else {
              setDetectionLabel(result.topLabel);
            }
          })
          .catch(() => {
            setDetectionLabel('Detection temporarily unavailable');
          })
          .finally(() => {
            detectBusyRef.current = false;
          });
      }, 1000);

      syncTimerRef.current = window.setInterval(() => {
        syncSafetyState();
      }, 5000);
    } catch (error) {
      setCameraActive(false);
      setDetecting(false);
      setDetectionLabel('Camera unavailable');
      setCameraError(extractErrorMessage(error, 'Could not access camera. Allow permission and retry.'));
      syncSafetyState({ camera_active: false });
    }
  }, [stopCamera, syncSafetyState]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void startCamera();
    }, 0);

    return () => {
      window.clearTimeout(initTimer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!cameraActive) return;
    syncSafetyState({ helmet_detected: helmetDetected, camera_active: true });
  }, [helmetDetected, cameraActive, syncSafetyState]);

  usePolling(
    () => deliveryService.me(),
    15000,
    (partner) => {
      setPartnerId(partner.id);
      setHelmetDetected(partner.helmet_detected);
      setCameraActive(partner.camera_active);
      setWarningCount(partner.helmet_warning_count ?? 0);
      setNavigationLocked(Boolean(partner.navigation_locked));
      setSafetyScore(partner.safety_score);
      setRating(partner.rating);
    },
  );

  usePolling(
    async () => {
      if (!partnerId) return null;
      const [speedData, helmetData] = await Promise.all([
        safetyService.getSpeed(partnerId),
        safetyService.checkHelmet(partnerId),
      ]);
      return { speedData, helmetData };
    },
    5000,
    (data) => {
      if (!data) return;
      setSpeed(Math.round(data.speedData.speed_kmh || 0));
      setSpeedUpdatedAt(new Date(data.speedData.timestamp).toLocaleTimeString());
      setHelmetDetected(Boolean(data.helmetData.helmet_detected));
      setCameraActive(Boolean(data.helmetData.camera_active));
      setWarningCount(data.helmetData.warning_count ?? 0);
      setWarningLimit(data.helmetData.warning_limit ?? 5);
      setNavigationLocked(Boolean(data.helmetData.navigation_locked));
      if (typeof data.helmetData.safety_score === 'number') {
        setSafetyScore(data.helmetData.safety_score);
      }
      if (typeof data.helmetData.rating === 'number') {
        setRating(data.helmetData.rating);
      }
    },
  );

  usePolling(
    () => deliveryService.getSafetyHistory(10),
    10000,
    (history) => {
      setSafetyHistory(history.filter((item) => item.type === 'helmet'));
    },
  );

  return (
    <>
      <TopBar title={t('nav_safety')} subtitle={t('active_monitoring')}>
        <div className={`status-pill ${isConnected ? 'online' : 'warning'}`}><div className="dot" /> {isConnected ? t('connected') : t('reconnecting')}</div>
      </TopBar>
      <div className="content">
        <div className="two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Panel title={t('live_speed')} action={<div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{t('limit')}: {speedLimit} KM/H</div>}>
              <div className="speed-gauge">
                <div className="gauge-circle">
                  <svg className="gauge-svg" viewBox="0 0 120 120">
                    <circle className="gauge-track" cx="60" cy="60" r="50" />
                    <circle
                      className={`gauge-fill ${isOver ? 'danger' : ''}`}
                      cx="60" cy="60" r="50"
                      strokeDasharray={377}
                      strokeDashoffset={offset}
                    />
                  </svg>
                  <div className="gauge-center">
                    <div className="gauge-value" style={{ color: isOver ? 'var(--red)' : 'var(--text)' }}>{speed}</div>
                    <div className="gauge-unit">km/h</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isOver ? 'var(--red)' : 'var(--green)' }}>
                  {isOver ? '⚠ OVER LIMIT' : '✓ WITHIN LIMIT'}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                  Last update: {speedUpdatedAt}
                </div>
              </div>
            </Panel>

            <Panel title="Helmet Detection">
              <div style={{ padding: 20 }}>
                <div className={`helmet-card ${helmetDetected ? '' : 'violation'}`}>
                  <div style={{ fontSize: 36 }}>⛑️</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: helmetDetected ? 'var(--green)' : 'var(--red)' }}>
                      {helmetDetected ? 'HELMET DETECTED' : 'HELMET NOT DETECTED'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>Continuous monitoring active</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 4 }}>
                      Last checked: {speedUpdatedAt}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 6 }}>
                      Label: {detectionLabel}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 4 }}>
                      Helmet confidence {(helmetConfidence * 100).toFixed(1)}% · Top score {(topScore * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)' }}>
                  Camera status: <span style={{ color: cameraActive ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{cameraActive ? 'Active' : 'Offline'}</span>
                </div>
                {cameraError && (
                  <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 12 }}>
                    {cameraError}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Panel title="Journey Camera" action={<span className="chip danger">● REC</span>}>
              <div style={{ padding: 16 }}>
                <div className="camera-feed">
                  <video ref={videoRef} className="camera-video" autoPlay muted playsInline />
                  {!cameraActive && <div className="camera-icon">📷</div>}
                  <div className="camera-rec"><div className="rec-dot" /> {cameraActive ? 'RECORDING' : 'OFFLINE'}</div>
                  <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                    {cameraActive ? (detecting ? 'HELMET ANALYSIS ● ACTIVE' : 'CAMERA CONNECTED') : 'CAMERA FEED NOT AVAILABLE'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      stopCamera();
                      setCameraActive(false);
                      setDetectionLabel('Camera paused');
                      syncSafetyState({ camera_active: false });
                    }}
                    disabled={!cameraActive}
                  >
                    Stop Camera
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      void startCamera();
                    }}
                  >
                    {cameraActive ? 'Restart Camera' : 'Start Camera'}
                  </button>
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Camera Status</span>
                    <span style={{ color: cameraActive ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>{cameraActive ? 'ACTIVE' : 'OFFLINE'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Helmet AI</span>
                    <span style={{ color: cameraActive ? 'var(--green)' : 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{cameraActive ? 'RUNNING' : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text2)' }}>Tampering Detected</span>
                    <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>NONE</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Violation History">
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <div className="turn-item normal" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Safety Score</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--green)' }}>
                      {safetyScore != null ? `${safetyScore.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div className="turn-item normal" style={{ padding: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Partner Rating</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--amber)' }}>
                      {rating != null ? rating.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text2)' }}>Helmet warnings</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: warningCount >= warningLimit ? 'var(--red)' : 'var(--amber)' }}>
                    {warningCount}/{warningLimit}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: navigationLocked ? 'var(--red)' : 'var(--text3)' }}>
                  {navigationLocked
                    ? 'Navigation is locked until helmet is detected.'
                    : 'Navigation will lock after 5 helmet warnings while riding.'}
                </div>

                {safetyHistory.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 12 }}>No helmet violations recorded recently.</div>
                ) : (
                  safetyHistory.slice(0, 5).map((item) => (
                    <div key={item.id} className="turn-item normal" style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 11, color: item.severity === 'penalty' ? 'var(--red)' : 'var(--amber)' }}>
                          {item.severity === 'penalty' ? 'Penalty' : 'Warning'} #{item.offense_count}
                        </strong>
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(item.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                        {item.detail || 'Helmet not detected during navigation.'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
