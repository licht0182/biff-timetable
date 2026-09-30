import type { CuratorFeatureMedia } from '../curator-feature-media'
import '../curator-artwork.css'

export default function CuratorArtwork({ media }: { media: CuratorFeatureMedia }) {
  return (
    <div className={`curator-artwork curator-artwork--${media.tone}`} aria-hidden="true">
      <svg className="curator-artwork-lines" viewBox="0 0 600 440" preserveAspectRatio="xMidYMid slice" focusable="false">
        <circle cx="435" cy="105" r="210" />
        <circle cx="435" cy="105" r="170" />
        <path d="M-40 400 640 50M-40 440 640 90M-40 480 640 130" />
      </svg>
      <span className="curator-artwork-kicker">DIRECTOR SPOTLIGHT</span>
      <span className="curator-artwork-title">{media.filmTitle}</span>
      <span className="curator-artwork-signature">BIFF TIMETABLE · 2026</span>
    </div>
  )
}
