import { type Plate, printsApi } from "@/api/prints";
import { MODEL_EXTS } from "@/constants/fileTypes";
import { extOf } from "@/utils/fileExtensions";
import ModelSnapshot from "./ModelSnapshot";

type Props = {
  plate: Plate;
  /** Edge length in px. */
  size?: number;
};

/** The stored thumbnail, else a snapshot rendered on the spot (and saved), else a placeholder. */
export default function PlateThumbnail({ plate, size = 32 }: Props) {
  const style = { width: size, height: size };
  const box = "shrink-0 overflow-hidden rounded-md";
  const ext = extOf(plate.filename);

  if (plate.thumb_url) {
    return (
      <img
        src={printsApi.fileUrl(plate.thumb_url)}
        alt=""
        loading="lazy"
        decoding="async"
        style={style}
        className={`${box} bg-surface-2 object-cover`}
      />
    );
  }
  if (MODEL_EXTS.has(ext)) {
    return (
      <div style={style} className={box}>
        <ModelSnapshot url={printsApi.fileUrl(plate.url)} ext={ext} plateId={plate.id} theme="light" compact />
      </div>
    );
  }
  return <div style={style} className={`${box} bg-surface-2`} />;
}
