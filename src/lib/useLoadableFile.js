import { useState, useCallback, useEffect, useRef } from "react";
import { supportsFileSystemAccess, saveFileHandle, loadFileHandle, verifyPermission } from "./fileHandle.js";

// Shared "load once, remember, manual refresh" behavior for any file this
// dashboard reads locally (the ops Excel, the revenue CSV, ...). Remembers
// the picked file via the File System Access API where supported (Chrome /
// Edge) so refresh doesn't require re-browsing; falls back to a plain file
// input elsewhere. Caches the parsed result in localStorage, versioned so
// shape changes don't get silently half-applied from an older cache.
export function useLoadableFile({ handleKey, cacheKey, cacheVersion, parse, accept, initial }) {
  const [data, setData] = useState(initial.data);
  const [fileName, setFileName] = useState(initial.fileName ?? null);
  const [lastLoaded, setLastLoaded] = useState(initial.lastLoaded ?? null);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  const applyFile = useCallback(
    async (file) => {
      setStatus("loading");
      try {
        const parsed = await parse(file);
        setData(parsed);
        setFileName(file.name);
        const now = new Date().toISOString();
        setLastLoaded(now);
        setStatus("idle");
        setErrorMsg(null);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ version: cacheVersion, data: parsed, fileName: file.name, lastLoaded: now })
        );
      } catch (err) {
        setStatus("error");
        setErrorMsg(err.message || "שגיאה בקריאת הקובץ");
      }
    },
    [parse, cacheKey, cacheVersion]
  );

  const pickFile = useCallback(async () => {
    if (supportsFileSystemAccess) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ accept }] });
        await saveFileHandle(handleKey, handle);
        const file = await handle.getFile();
        await applyFile(file);
      } catch (err) {
        if (err.name !== "AbortError") {
          setStatus("error");
          setErrorMsg(err.message || "שגיאה בבחירת הקובץ");
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [applyFile, handleKey, accept]);

  const refresh = useCallback(async () => {
    if (supportsFileSystemAccess) {
      const handle = await loadFileHandle(handleKey);
      if (handle) {
        setStatus("loading");
        try {
          const ok = await verifyPermission(handle);
          if (!ok) throw new Error("אין הרשאה לגשת לקובץ — יש לבחור אותו מחדש");
          const file = await handle.getFile();
          await applyFile(file);
        } catch (err) {
          setStatus("error");
          setErrorMsg(err.message || "שגיאה ברענון הקובץ");
        }
        return;
      }
    }
    pickFile();
  }, [applyFile, pickFile, handleKey]);

  const onFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) applyFile(file);
      e.target.value = "";
    },
    [applyFile]
  );

  useEffect(() => {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.version === cacheVersion) {
          setData(parsed.data);
          setFileName(parsed.fileName || null);
          setLastLoaded(parsed.lastLoaded || null);
        } else {
          // Cache predates this shape — drop it rather than silently
          // applying a partial/stale object over the bundled default.
          localStorage.removeItem(cacheKey);
        }
      } catch {
        // ignore corrupt cache
      }
    }
    if (supportsFileSystemAccess) {
      loadFileHandle(handleKey).then(async (handle) => {
        if (!handle) return;
        const ok = await verifyPermission(handle).catch(() => false);
        if (!ok) return;
        const file = await handle.getFile();
        applyFile(file);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    fileName,
    lastLoaded,
    status,
    errorMsg,
    pickFile,
    refresh,
    fileInputRef,
    onFileInputChange,
  };
}
