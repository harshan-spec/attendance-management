import { SVCE_FALLBACK_OPTIONS, type CollegeSelectOption, type SvceTimetableOptions } from "@/lib/svce-timetable";

const TIMETABLE_URL = "https://www.svce.ac.in/timetable/";
const COLLEGE_ORIGIN = "https://www.svce.ac.in";
const requestHeaders = {
  Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; Attendly timetable lookup/1.0)",
};
const MAX_TIMETABLE_BYTES = 15 * 1024 * 1024;
const MAX_COLLEGE_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;

async function fetchCollegeResource(input: string | URL, init: RequestInit) {
  let url = new URL(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (url.protocol !== "https:" || url.origin !== COLLEGE_ORIGIN) {
      throw new Error("The timetable source redirected outside the official college website.");
    }
    const response = await fetch(url, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();
    url = new URL(location, url);
  }
  throw new Error("The college timetable source redirected too many times.");
}

async function readLimitedBody(response: Response, maximumBytes: number) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maximumBytes)) {
    throw new Error("The college timetable response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The college timetable response was empty.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("The college timetable response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseSelectOptions(html: string, name: string): CollegeSelectOption[] {
  const select = html.match(new RegExp(`<select\\b(?=[^>]*\\bname=["']${name}["'])[^>]*>([\\s\\S]*?)<\\/select>`, "i"));
  if (!select) return [];
  return Array.from(select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)).flatMap((match) => {
    const value = match[1].match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
    const label = decodeHtml(match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
    return value && label && value !== "" && label !== "--Select--" ? [{ value, label }] : [];
  });
}

function parseOptions(html: string): SvceTimetableOptions {
  const options: SvceTimetableOptions = {
    departments: parseSelectOptions(html, "department"),
    academicYears: parseSelectOptions(html, "academic_year"),
    years: parseSelectOptions(html, "year"),
    sections: parseSelectOptions(html, "section"),
  };
  if (!options.departments.length || !options.academicYears.length || !options.years.length || !options.sections.length) {
    throw new Error("SVCE timetable choices could not be read.");
  }
  return options;
}

async function fetchTimetablePage(url: string) {
  const response = await fetchCollegeResource(url, {
    cache: "no-store",
    headers: requestHeaders,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("The SVCE timetable page is unavailable.");
  const bytes = await readLimitedBody(response, MAX_COLLEGE_PAGE_BYTES);
  return new TextDecoder().decode(bytes);
}

function getYearValue(options: CollegeSelectOption[], year: number) {
  const ordinal = year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : "4th";
  const value = `${ordinal}_year`;
  return options.find((option) => option.value === value)?.value ?? null;
}

function notFound(message: string) {
  return Response.json({ found: false, message }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (query.get("mode") === "options") {
    try {
      const options = parseOptions(await fetchTimetablePage(TIMETABLE_URL));
      return Response.json({
        options,
        currentAcademicYear: options.academicYears.at(-1)?.value ?? "",
        sourceAvailable: true,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({
        options: SVCE_FALLBACK_OPTIONS,
        currentAcademicYear: SVCE_FALLBACK_OPTIONS.academicYears.at(-1)?.value ?? "",
        sourceAvailable: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  try {
    const sourcePage = await fetchTimetablePage(TIMETABLE_URL);
    const options = parseOptions(sourcePage);
    const department = query.get("department") ?? "";
    const academicYear = query.get("academicYear") ?? "";
    const studyYear = Number(query.get("studyYear"));
    const semester = Number(query.get("semester"));
    const section = query.get("section") ?? "none";
    const yearValue = Number.isInteger(studyYear) && studyYear >= 1 && studyYear <= 4 ? getYearValue(options.years, studyYear) : null;
    const term = semester % 2 === 1 ? "odd" : "even";

    if (!options.departments.some((option) => option.value === department) ||
        !options.academicYears.some((option) => option.value === academicYear) ||
        !yearValue ||
        !options.sections.some((option) => option.value === section) ||
        !Number.isInteger(semester) || semester < 1 || semester > 8 || Math.ceil(semester / 2) !== studyYear) {
      return notFound("These academic details do not match the timetable choices on the college site.");
    }

    const params = new URLSearchParams({
      department,
      academic_year: academicYear,
      year: yearValue,
      semester: term,
      section,
    });
    const selectedUrl = `${TIMETABLE_URL}?${params.toString()}`;
    const selectedPage = await fetchTimetablePage(selectedUrl);
    const relativePdf = selectedPage.match(/<iframe\b[^>]*\bsrc=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1]
      ?? selectedPage.match(/<a\b[^>]*\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>\s*Open PDF\s*<\/a>/i)?.[1];
    if (!relativePdf) return notFound("The college has not published a timetable for these details yet.");

    const pdfUrl = new URL(decodeHtml(relativePdf), selectedUrl);
    if (pdfUrl.origin !== COLLEGE_ORIGIN || !pdfUrl.pathname.startsWith("/timetable/files/") || !pdfUrl.pathname.toLowerCase().endsWith(".pdf")) {
      return notFound("The college timetable link was not in a supported format.");
    }

    if (query.get("mode") === "pdf") {
      const pdfResponse = await fetchCollegeResource(pdfUrl, { cache: "no-store", headers: requestHeaders, signal: AbortSignal.timeout(20_000) });
      if (!pdfResponse.ok || !pdfResponse.headers.get("content-type")?.toLowerCase().includes("pdf")) {
        return notFound("The college timetable file could not be downloaded.");
      }

      const pdfBytes = await readLimitedBody(pdfResponse, MAX_TIMETABLE_BYTES);
      if (pdfBytes.byteLength < 5 || pdfBytes.byteLength > MAX_TIMETABLE_BYTES) {
        return notFound("The college timetable file is empty or too large to preview.");
      }
      const signature = new TextDecoder().decode(pdfBytes.slice(0, 1024));
      if (!signature.includes("%PDF-")) return notFound("The college timetable file was not a valid PDF.");

      return new Response(pdfBytes, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Disposition": `inline; filename="${pdfUrl.pathname.split("/").at(-1)?.replaceAll(/[^\w.-]/g, "_") || "timetable.pdf"}"`,
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf",
          "X-College-Timetable-Url": pdfUrl.toString(),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const pdfResponse = await fetchCollegeResource(pdfUrl, { method: "HEAD", cache: "no-store", headers: requestHeaders, signal: AbortSignal.timeout(12_000) });
    if (!pdfResponse.ok || !pdfResponse.headers.get("content-type")?.toLowerCase().includes("pdf")) {
      return notFound("The college timetable file could not be downloaded.");
    }

    return Response.json({
      found: true,
      pdfUrl: pdfUrl.toString(),
      message: "The official college timetable was found.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return notFound("The college timetable could not be reached. Your default timetable will remain available.");
  }
}
