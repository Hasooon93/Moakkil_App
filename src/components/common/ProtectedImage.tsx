/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/components/common/ProtectedImage.tsx
 * الوصف: مكون عرض الصور المحمية من خزنة Cloudflare R2 عبر التوكن و Blob URL
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import { R2Service } from '../../services/r2.service';

interface ProtectedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  r2Key?: string | null;
  fallbackSrc?: string;
}

export const ProtectedImage: React.FC<ProtectedImageProps> = ({
  r2Key,
  fallbackSrc = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  alt = 'صورة',
  ...imgProps
}) => {
  const [src, setSrc] = useState<string>(fallbackSrc);

  useEffect(() => {
    let mounted = true;
    if (!r2Key) {
      setSrc(fallbackSrc);
      return;
    }

    if (r2Key.startsWith('http://') || r2Key.startsWith('https://') || r2Key.startsWith('data:')) {
      setSrc(r2Key);
      return;
    }

    R2Service.fetchFileAsBlobUrl(r2Key)
      .then((blobUrl) => {
        if (mounted && blobUrl) {
          setSrc(blobUrl);
        }
      })
      .catch(() => {
        if (mounted) {
          setSrc(fallbackSrc);
        }
      });

    return () => {
      mounted = false;
    };
  }, [r2Key, fallbackSrc]);

  return <img src={src} alt={alt} {...imgProps} />;
};
