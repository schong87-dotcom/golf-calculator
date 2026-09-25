// pdf.js를 필요할 때만 불러와 PDF 한 쪽을 캔버스와 텍스트 레이어로 그리는 모듈.

const PDFJS_VERSION = '6.3.289';
const CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
let pdfjsPromise = null;

function loadPdfjs() {
  pdfjsPromise ||= import(`${CDN}legacy/build/pdf.min.mjs`).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = `${CDN}legacy/build/pdf.worker.min.mjs`;
    return pdfjs;
  });
  return pdfjsPromise;
}

export async function openPdf(buffer) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    cMapUrl: `${CDN}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${CDN}standard_fonts/`,
    wasmUrl: `${CDN}wasm/`,
    iccUrl: `${CDN}iccs/`,
  }).promise;
}

// 책갈피(outline)를 목차로 펼친다. 쪽 번호는 0부터 센다.
export async function getPdfToc(pdf) {
  const toc = [];
  async function walk(items, level) {
    for (const item of items || []) {
      if (level > 3) break;
      let page = null;
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        if (Array.isArray(dest)) page = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
      } catch {
        page = null;
      }
      if (page !== null && item.title?.trim()) toc.push({ id: `pdf-toc-${toc.length}`, level, title: item.title.trim(), page });
      await walk(item.items, level + 1);
    }
  }
  await walk(await pdf.getOutline(), 1);
  return toc;
}

// 한 쪽을 화면에 꽉 차게(비율 유지) 그린다. cancel()로 중간에 멈출 수 있고, 화면에 붙이는 것은 호출한 쪽이 한다.
export function renderPdfPage(pdf, index, stage) {
  let cancelled = false;
  let task = null;
  const cancelledError = () => Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' });
  const done = (async () => {
    const pdfjs = await loadPdfjs();
    const page = await pdf.getPage(index + 1);
    if (cancelled) throw cancelledError();
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(stage.clientWidth / base.width, stage.clientHeight / base.height);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;

    const pageBox = document.createElement('div');
    pageBox.className = 'pdf-page';
    pageBox.style.width = `${Math.floor(viewport.width)}px`;
    pageBox.style.height = `${Math.floor(viewport.height)}px`;
    pageBox.style.setProperty('--total-scale-factor', String(scale));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    pageBox.append(canvas, textLayer);

    task = page.render({
      canvas,
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
    });
    await task.promise;
    if (cancelled) throw cancelledError();
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();
    if (cancelled) throw cancelledError();
    return pageBox;
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}
