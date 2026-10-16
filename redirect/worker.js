// getsnapply.com (and www) → snapply.co.uk, keeping the path.
export default {
  fetch(request) {
    const url = new URL(request.url);
    // Section names (getsnapply.com/pricing) go to that section of the one-page site.
    const section = { "/pricing": "#pricing", "/faq": "#faq", "/features": "#features", "/privacy-by-design": "#privacy" }[url.pathname.replace(/\/$/, "")];
    if (section) return Response.redirect("https://snapply.co.uk/" + section, 301);
    return Response.redirect("https://snapply.co.uk" + url.pathname + url.search, 301);
  },
};
