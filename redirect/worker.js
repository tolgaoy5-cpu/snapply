// getsnapply.com (and www) → snapply.co.uk, keeping the path.
export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect("https://snapply.co.uk" + url.pathname + url.search, 301);
  },
};
