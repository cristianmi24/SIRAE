// Aviso visible mientras la cámara está encendida, con un botón para apagarla.
export function CameraIndicator({ onStop }: { onStop: () => void }) {
  return <div className="camera-indicator" role="status">
    <span className="camera-dot" aria-hidden="true" />
    <span>Cámara encendida</span>
    <button type="button" onClick={onStop}>Apagar</button>
  </div>;
}
