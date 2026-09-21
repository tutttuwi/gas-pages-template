const fs = require("fs");
const path = require("path");

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

function mimeFor(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isInside(rootDir, filePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveLocalImage(src, inputDir) {
  const trimmed = String(src).split("?")[0].split("#")[0].trim();
  if (!trimmed || trimmed.includes("\0")) {
    return undefined;
  }
  const normalizedSrc = trimmed.replace(/\\/g, "/");
  if (normalizedSrc.split("/").includes("..")) {
    return undefined;
  }
  const relativeSrc = normalizedSrc.replace(/^\/+/, "");
  if (!relativeSrc || path.isAbsolute(relativeSrc)) {
    return undefined;
  }
  const candidates = [
    path.resolve(inputDir, relativeSrc),
    path.resolve(inputDir, "pages", relativeSrc),
  ];
  return candidates.find((candidate) => isInside(inputDir, candidate) && fs.existsSync(candidate));
}

function inlineImages(content, inputDir) {
  return content.replace(
    /(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi,
    (match, prefix, quote, src) => {
      if (/^(?:https?:|data:|\/\/)/i.test(src)) {
        return match;
      }
      const filePath = resolveLocalImage(src, inputDir);
      if (!filePath) {
        console.warn(`[eleventy] image not found, left as-is: ${src}`);
        return match;
      }
      const dataUri = `data:${mimeFor(filePath)};base64,${fs.readFileSync(filePath).toString("base64")}`;
      return `${prefix}${quote}${dataUri}${quote}`;
    },
  );
}

module.exports = function (eleventyConfig) {
  eleventyConfig.ignores.add("docs/README.md");
  eleventyConfig.ignores.add("docs/_data/README.md");

  eleventyConfig.addPassthroughCopy({ "gas/Code.js": "Code.js" });
  eleventyConfig.addPassthroughCopy({ "appsscript.json": "appsscript.json" });

  eleventyConfig.addCollection("pages", (collectionApi) =>
    collectionApi
      .getFilteredByTag("page")
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)),
  );

  eleventyConfig.addTransform("inlineImages", function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) {
      return content;
    }
    return inlineImages(content, path.join(__dirname, "docs"));
  });

  eleventyConfig.on("eleventy.before", ({ dir }) => {
    fs.rmSync(dir.output, { recursive: true, force: true });
  });

  return {
    dir: {
      input: "docs",
      output: "dist",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
};
