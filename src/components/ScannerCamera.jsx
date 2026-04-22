import { useEffect, useRef, useState, useCallback } from 'react'
import QrScanner from 'qr-scanner'

/**
 * ScannerCamera component
 * Handles camera lifecycle, QR scanning, and dedupe logic
 * 
 * @param {Object} props
 * @param {Function} props.onScan - Callback when QR code is scanned (value)
 * @param {boolean} props.isActive - Whether scanner should be active
 * @param {number} props.dedupeCooldown - Cooldown in ms to prevent duplicate scans (default: 2500)
 */
export default function ScannerCamera({ onScan, isActive, dedupeCooldown = 2500 }) {
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const lastScannedRef = useRef({ value: null, timestamp: 0 })
  
  const [cameraStatus, setCameraStatus] = useState('idle') // idle | requesting | ready | denied | unsupported | error
  const [cameraError, setCameraError] = useState(null)
  const [availableCameras, setAvailableCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState(null)

  // Handle QR scan result with dedupe
  const handleScanResult = useCallback((result) => {
    if (!result?.data) return

    const now = Date.now()
    const scannedValue = result.data.trim()

    // Dedupe: ignore if same value scanned within cooldown period
    if (
      lastScannedRef.current.value === scannedValue &&
      now - lastScannedRef.current.timestamp < dedupeCooldown
    ) {
      return
    }

    // Update last scanned
    lastScannedRef.current = { value: scannedValue, timestamp: now }

    // Call parent callback
    if (onScan) {
      onScan(scannedValue)
    }
  }, [onScan, dedupeCooldown])

  // Initialize camera and scanner
  const startCamera = useCallback(async (cameraId = null) => {
    if (!videoRef.current) return

    setCameraStatus('requesting')
    setCameraError(null)

    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('unsupported')
        setCameraError('Browser tidak mendukung akses kamera. Gunakan browser modern seperti Chrome, Firefox, atau Safari.')
        return
      }

      // List available cameras
      const devices = await QrScanner.listCameras(true)
      setAvailableCameras(devices)

      // Determine which camera to use
      let targetCameraId = cameraId || selectedCameraId

      // If no camera selected, prefer environment (back) camera on mobile
      if (!targetCameraId && devices.length > 0) {
        const envCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'))
        targetCameraId = envCamera ? envCamera.id : devices[0].id
      }

      setSelectedCameraId(targetCameraId)

      // Create QR scanner instance
      const scanner = new QrScanner(
        videoRef.current,
        handleScanResult,
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: targetCameraId || 'environment',
        }
      )

      scannerRef.current = scanner

      // Start scanning
      await scanner.start()
      setCameraStatus('ready')

    } catch (error) {
      console.error('Camera error:', error)
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraStatus('denied')
        setCameraError('Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser Anda.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraStatus('error')
        setCameraError('Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.')
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setCameraStatus('error')
        setCameraError('Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.')
      } else if (error.name === 'SecurityError') {
        setCameraStatus('unsupported')
        setCameraError('Akses kamera memerlukan HTTPS. Pastikan menggunakan koneksi aman.')
      } else {
        setCameraStatus('error')
        setCameraError(`Error: ${error.message || 'Gagal mengakses kamera'}`)
      }
    }
  }, [handleScanResult, selectedCameraId])

  // Stop camera and cleanup
  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop()
      scannerRef.current.destroy()
      scannerRef.current = null
    }
    setCameraStatus('idle')
  }, [])

  // Switch camera
  const switchCamera = useCallback(async (cameraId) => {
    stopCamera()
    await startCamera(cameraId)
  }, [stopCamera, startCamera])

  // Effect: Start/stop camera based on isActive prop
  useEffect(() => {
    if (isActive) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isActive]) // Only depend on isActive to avoid restart loops

  return (
    <div className="scanner-camera">
      <div className="camera-preview-container">
        <video
          ref={videoRef}
          className="camera-preview"
          playsInline
          muted
        />
        
        {cameraStatus === 'requesting' && (
          <div className="camera-overlay">
            <div className="camera-status-message">
              <div className="spinner"></div>
              <p>Menyiapkan kamera...</p>
            </div>
          </div>
        )}

        {cameraStatus === 'ready' && (
          <div className="camera-frame-overlay">
            <div className="scan-frame"></div>
            <p className="scan-instruction">Arahkan QR code ke dalam frame</p>
          </div>
        )}

        {(cameraStatus === 'denied' || cameraStatus === 'unsupported' || cameraStatus === 'error') && (
          <div className="camera-overlay error">
            <div className="camera-status-message">
              <div className="error-icon">⚠️</div>
              <h4>
                {cameraStatus === 'denied' && 'Izin Kamera Ditolak'}
                {cameraStatus === 'unsupported' && 'Kamera Tidak Didukung'}
                {cameraStatus === 'error' && 'Error Kamera'}
              </h4>
              <p>{cameraError}</p>
              <button 
                className="btn-secondary mt-2"
                onClick={() => startCamera()}
              >
                Coba Lagi
              </button>
            </div>
          </div>
        )}
      </div>

      {cameraStatus === 'ready' && availableCameras.length > 1 && (
        <div className="camera-controls">
          <label className="camera-select-label">
            <span>Pilih Kamera:</span>
            <select
              value={selectedCameraId || ''}
              onChange={(e) => switchCamera(e.target.value)}
              className="camera-select"
            >
              {availableCameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Kamera ${camera.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="camera-status-badge">
        {cameraStatus === 'ready' && <span className="badge-ready">Kamera Siap</span>}
        {cameraStatus === 'requesting' && <span className="badge-requesting">Meminta Akses...</span>}
        {cameraStatus === 'denied' && <span className="badge-error">Izin Ditolak</span>}
        {cameraStatus === 'unsupported' && <span className="badge-error">Tidak Didukung</span>}
        {cameraStatus === 'error' && <span className="badge-error">Error</span>}
      </div>
    </div>
  )
}
