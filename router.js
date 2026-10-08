let cleanup = null;
export function route() {
  const raw = location.hash.slice(1) || '/home';
  const [pathname, query = ''] = raw.split('?');
  return {
    parts: pathname
      .split('/')
      .filter(Boolean)
      .map((p) => decodeURIComponent(p)),
    query: new URLSearchParams(query),
  };
}
export function navigate(path) {
  if (location.hash === `#${path}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}
export function startRouter(render) {
  const update = () => {
    cleanup?.();
    cleanup = null;
    let active = true;
    const result = render(route(), () => active);
    cleanup = () => {
      active = false;
    };
    if (result?.catch) result.catch(console.error);
  };
  addEventListener('hashchange', update);
  update();
}
