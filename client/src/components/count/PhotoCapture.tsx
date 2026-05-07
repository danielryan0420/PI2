import React, { useRef, useState } from 'react';
import { Button } from '../ui/Button';

interface PhotoCaptureProps {
  countId: number | null;
  onUploaded?: () => void;
}

export function PhotoCapture({ countId, onUploaded }: PhotoCaptureProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  async function handleFiles(files: FileList) {
    if (!countId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('photos', f));
      const res = await fetch(`/api/counts/${countId}/photos`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      // show preview thumbnails
      const urls = Array.from(files).map((f) => URL.createObjectURL(f));
      setPreviews((prev) => [...prev, ...urls]);
      onUploaded?.();
    } catch { /**/ }
    finally { setUploading(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          loading={uploading}
          disabled={!countId}
          className="flex-1"
        >
          📷 {countId ? 'Add Photo' : 'Save count first'}
        </Button>
        {/* Direct camera capture on mobile */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>
      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((url, i) => (
            <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          ))}
        </div>
      )}
    </div>
  );
}
