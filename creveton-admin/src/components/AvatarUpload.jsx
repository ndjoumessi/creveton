import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, RotateCcw, RotateCw } from 'lucide-react';
import Modal from './Modal';
import notify from './Toast';
import { initials } from '../utils/format';
import { uploadAvatar, removeAvatar } from '../services/settings.service';
import './AvatarUpload.css';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const VIEWPORT = 260; // px — taille du viewport carré de recadrage
const OUTPUT = 256; // px — taille du canvas de sortie
const RING_R = 60; // rayon de l'anneau de progression (cx=cy=66 sur 132)
const RING_C = 2 * Math.PI * RING_R; // circonférence

/**
 * AvatarUpload — cercle 120px avec survol caméra, modale de recadrage
 * (pan / zoom / rotation), upload avec anneau de progression doré, et
 * suppression avec confirmation inline.
 *
 * Props :
 *  - name        : string  — nom (initiales + couleur de repli)
 *  - avatarUrl   : string|null — URL de l'avatar courant
 *  - onUploaded  : (avatarUrl: string) => void — après upload réussi
 *  - onRemoved   : () => void — après suppression réussie
 */
export default function AvatarUpload({ name, avatarUrl, onUploaded, onRemoved }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);

  const [imgFailed, setImgFailed] = useState(false);
  const [progress, setProgress] = useState(null); // null = pas d'upload en cours
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  // État de recadrage
  const [cropOpen, setCropOpen] = useState(false);
  const [srcUrl, setSrcUrl] = useState(null); // objectURL de l'image source
  const [imgEl, setImgEl] = useState(null); // HTMLImageElement chargé
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // degrés (multiples de 90)
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // pan en px (espace viewport)
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Réinitialise l'erreur d'image quand l'URL change.
  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  // Révoque l'objectURL source à la fermeture / démontage (anti-fuite).
  useEffect(() => () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
  }, [srcUrl]);

  const showImage = avatarUrl && !imgFailed;
  const busy = progress != null;

  const openPicker = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const closeCrop = useCallback(() => {
    setCropOpen(false);
    setImgEl(null);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setSrcUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file) return;
    if (file.size > MAX_BYTES) {
      notify.error(t('settings.account.tooBig'));
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      notify.error(t('settings.account.badFormat'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImgEl(image);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setCropOpen(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      notify.error(t('settings.account.badFormat'));
    };
    image.src = url;
    setSrcUrl(url);
  };

  // ---- Pan (pointer events) ----
  const onPointerDown = (e) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.sx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.sy),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  // ---- Wheel-to-zoom ----
  const onWheel = (e) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(1, z - e.deltaY * 0.0015)));
  };

  const rotate = (delta) => setRotation((r) => r + delta);

  // ---- Calcul de l'échelle de base : couvre le viewport en tenant compte de la rotation ----
  const baseScaleFor = useCallback(
    (image, deg) => {
      // Pour des rotations multiples de 90°, les dimensions effectives s'échangent.
      const swapped = Math.abs(Math.round(deg) % 180) === 90;
      const w = swapped ? image.naturalHeight : image.naturalWidth;
      const h = swapped ? image.naturalWidth : image.naturalHeight;
      return Math.max(VIEWPORT / w, VIEWPORT / h);
    },
    [],
  );

  // ---- Génère le blob WebP recadré ----
  const buildBlob = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!imgEl) {
          reject(new Error('no-image'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT;
        canvas.height = OUTPUT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no-ctx'));
          return;
        }
        const ratio = OUTPUT / VIEWPORT;
        const base = baseScaleFor(imgEl, rotation);
        const scale = base * zoom;

        ctx.save();
        // centre du canvas
        ctx.translate(OUTPUT / 2, OUTPUT / 2);
        // pan (exprimé en px viewport → px canvas)
        ctx.translate(offset.x * ratio, offset.y * ratio);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale * ratio, scale * ratio);
        ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2);
        ctx.restore();

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toblob-failed'));
          },
          'image/webp',
          0.85,
        );
      }),
    [imgEl, rotation, zoom, offset, baseScaleFor],
  );

  const doUpload = async (blob) => {
    setProgress(0);
    try {
      const res = await uploadAvatar(blob, setProgress);
      setProgress(100);
      notify.success(t('settings.account.uploadSuccess'));
      onUploaded?.(res.avatar_url);
      // laisse l'anneau s'estomper
      window.setTimeout(() => setProgress(null), 350);
    } catch {
      notify.error(t('settings.account.uploadError'));
      setProgress(null);
    }
  };

  const onSaveCrop = async () => {
    try {
      const blob = await buildBlob();
      closeCrop();
      doUpload(blob);
    } catch {
      notify.error(t('settings.account.uploadError'));
    }
  };

  const doRemove = async () => {
    setRemoving(true);
    try {
      await removeAvatar();
      onRemoved?.();
      notify.info(t('settings.account.avatarRemoved'));
      setConfirming(false);
    } catch {
      notify.error(t('settings.account.uploadError'));
    } finally {
      setRemoving(false);
    }
  };

  // Style live de l'image dans le viewport de recadrage.
  const previewStyle = imgEl
    ? (() => {
        const base = baseScaleFor(imgEl, rotation);
        const scale = base * zoom;
        return {
          width: imgEl.naturalWidth,
          height: imgEl.naturalHeight,
          transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
        };
      })()
    : undefined;

  const dashOffset = RING_C * (1 - (progress ?? 0) / 100);

  return (
    <div className="av-wrap">
      <button
        type="button"
        className={`av-circle${busy ? ' is-busy' : ''}`}
        onClick={openPicker}
        aria-label={t('settings.account.changeAvatar')}
        aria-busy={busy}
      >
        {showImage ? (
          <img
            className="av-img"
            src={avatarUrl}
            alt=""
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="av-initials">{initials(name)}</span>
        )}

        {!busy && (
          <span className="av-overlay">
            <Camera size={22} aria-hidden="true" />
            <span className="av-overlay-label">{t('settings.account.changeAvatar')}</span>
          </span>
        )}

        {busy && (
          <>
            <span className="av-ring-veil" />
            <svg className="av-ring" viewBox="0 0 132 132" aria-hidden="true">
              <circle className="av-ring-track" cx="66" cy="66" r={RING_R} />
              <circle
                className="av-ring-fill"
                cx="66"
                cy="66"
                r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 66 66)"
              />
              <text className="av-ring-pct" x="66" y="74" textAnchor="middle">
                {`${progress ?? 0}%`}
              </text>
            </svg>
          </>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={onFileChange}
      />

      {showImage && !busy && (
        confirming ? (
          <span className="av-confirm">
            <span className="av-confirm-q">{t('settings.account.removeConfirm')}</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={doRemove}
              disabled={removing}
            >
              {t('settings.account.yes')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              disabled={removing}
            >
              {t('settings.account.no')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="av-remove-link"
            onClick={() => setConfirming(true)}
          >
            {t('settings.account.removeAvatar')}
          </button>
        )
      )}

      <Modal
        open={cropOpen}
        onClose={closeCrop}
        title={t('settings.account.crop.title')}
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={closeCrop}>
              {t('settings.account.crop.cancel')}
            </button>
            <button type="button" className="btn btn-gold" onClick={onSaveCrop}>
              {t('settings.account.crop.save')}
            </button>
          </>
        }
      >
        <div className="av-crop">
          <div
            className={`av-crop-viewport${dragging ? ' is-dragging' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {srcUrl && (
              <img className="av-crop-img" src={srcUrl} alt="" style={previewStyle} />
            )}
            <div className="av-crop-mask">
              <div className="av-crop-grid" />
              <div className="av-crop-mask-circle" />
            </div>
          </div>

          <div className="av-crop-controls">
            <label className="av-crop-zoom">
              <span className="av-crop-zoom-label">{t('settings.account.crop.zoom')}</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <div className="av-crop-rotate">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => rotate(-90)}
                aria-label={t('settings.account.crop.rotateLeft')}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {t('settings.account.crop.rotateLeft')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => rotate(90)}
                aria-label={t('settings.account.crop.rotateRight')}
              >
                <RotateCw size={16} aria-hidden="true" />
                {t('settings.account.crop.rotateRight')}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
