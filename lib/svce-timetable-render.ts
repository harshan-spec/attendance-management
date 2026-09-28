const PDF_WORKER_PATH = "/pdf.worker.min.mjs?v=6.3.289-legacy";

export async function renderTimetablePdfPages(pdfBytes: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const imageUrls: string[] = [];

  try {
    const pdf = await loadingTask.promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const pageWidth = page.view[2] - page.view[0];
      const viewport = page.getViewport({ scale: Math.min(2.4, 1600 / pageWidth) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The college timetable page could not be rendered.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;

      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("The college timetable image could not be created."));
        }, "image/png");
      });
      imageUrls.push(URL.createObjectURL(image));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    return imageUrls;
  } catch (error) {
    imageUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  } finally {
    await loadingTask.destroy();
  }
}
