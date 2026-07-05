import { useState, useCallback, useRef } from "react";
import { supportsFileSystemAccess, saveFileHandle, loadFileHandle, verifyPermission } from "./fileHandle.js";

// Shared "pick a local file, remember it, one-click refresh" behavior for
// the files this dashboard ingests (the ops Excel, the revenue CSV).
// Remembers the picked file via the File System Access API where supported
// (Chrome/Edge) so refresh doesn't require re-browsing; falls back to a
// plain file input elsewhere.
//
// The hook no longer holds the parsed data or caches it locally — parsed
// results are handed to `onParsed(parsed, fileName)`, which is expected to
// persist them (to Supabase) and update app state. Awaited, so persistence
// failures surface here as an error status.
export function useLoadableFile({ handleKey, parse, accept, onParsed }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  const applyFile = useCallback(
    async (file) => {
      setStatus("loading");
      try {
        const parsed = await parse(file);
        await onParsed(parsed, file.name);
        setStatus("idle");
        setErrorMsg(null);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err.message || "שגיאה בקריאת הקובץ");
      }
    },
    [parse, onParsed]
  );

  const pickFile = useCallback(async () => {
    if (supportsFileSystemAccess) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [accept] });
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

  return { status, errorMsg, pickFile, refresh, fileInputRef, onFileInputChange };
}
