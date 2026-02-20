import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import './PdfViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const PdfViewer = ({ url }) => {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;

    pdfjsLib.getDocument(url).promise.then((doc) => {
      if (!cancelled) {
        setPdf(doc);
        setTotalPages(doc.numPages);
      }
    }).catch((err) => {
      console.error('PDF load error:', err);
    });

    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    pdf.getPage(page).then((p) => {
      const viewport = p.getViewport({ scale: 1 });
      const scale = 350 / viewport.width;
      const scaledViewport = p.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      p.render({
        canvasContext: canvas.getContext('2d'),
        viewport: scaledViewport,
      });
    });
  }, [pdf, page]);

  return (
    <div className="pdf-viewer">
      <canvas ref={canvasRef} className="pdf-canvas" />
      {totalPages > 1 && (
        <div className="pdf-controls">
          <button
            className="pdf-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            &lt;--
          </button>
          <span className="pdf-page">{page}/{totalPages}</span>
          <button
            className="pdf-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            --&gt;
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfViewer;
