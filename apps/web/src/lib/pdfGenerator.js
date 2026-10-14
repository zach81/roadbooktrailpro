import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Exporte un élément DOM sous la forme d'un document PDF A4 multipages haute résolution
 * @param {HTMLElement} element - Élément HTML à exporter
 * @param {Object} options - Options d'export
 * @param {string} options.filename - Nom du fichier de sortie
 * @param {string} options.orientation - 'portrait' ou 'landscape'
 * @param {Function} options.onProgress - Callback de statut
 */
export async function exportElementToPdf(element, options = {}) {
  const {
    filename = "roadbook-trail.pdf",
    orientation = "portrait",
    onProgress = () => {}
  } = options;

  if (!element) {
    throw new Error("Élément DOM introuvable pour la génération du PDF.");
  }

  onProgress("Capture et rendu haute définition...");

  const isLandscape = orientation === "landscape" || orientation === "l";
  const a4WidthMm = isLandscape ? 297 : 210;
  const a4HeightMm = isLandscape ? 210 : 297;
  
  // Largeur cible standard 96 DPI correspondant exactement au ratio A4 (210mm ≈ 794px, 297mm ≈ 1123px)
  const targetWidthPx = isLandscape ? 1123 : 794;

  // Capture avec ratio retina 2x pour une netteté maximale des textes et graphiques vectoriels
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: targetWidthPx,
    width: targetWidthPx,
    onclone: (clonedDoc) => {
      // S'assurer que le clone a exactement la largeur cible A4 et aucun débordement
      const el = clonedDoc.getElementById(element.id) || clonedDoc.body;
      if (el) {
        el.style.backgroundColor = "#ffffff";
        el.style.color = "#0f172a";
        el.style.width = `${targetWidthPx}px`;
        el.style.maxWidth = `${targetWidthPx}px`;
        el.style.minWidth = `${targetWidthPx}px`;
        el.style.margin = "0";
        el.style.boxSizing = "border-box";
        el.style.overflow = "hidden";
      }
    }
  });

  onProgress("Assemblage du document PDF multipages...");

  const pdf = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4"
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = a4WidthMm;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  let page = 1;

  // Première page
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= a4HeightMm;

  // Pages suivantes si nécessaire (seuil de 3mm pour éviter les pages blanches créées par de légers arrondis)
  while (heightLeft > 3) {
    position = -(page * a4HeightMm);
    pdf.addPage();
    page++;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= a4HeightMm;
  }

  onProgress("Téléchargement du fichier...");
  pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  return true;
}

