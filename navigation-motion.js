const entries = {
  livros: ["translateX(-7px) perspective(1100px) rotateY(-9deg)", "0% 50%"],
  albuns: ["translateX(21px) perspective(1100px) rotateY(6deg)", "100% 50%"],
  pagina: ["perspective(1100px) translateZ(-65px) scale(.97)", "50% 30%"],
};
let last;
export function animateNavigation(element, route, key = route) {
  const changed = key !== last;
  last = key;
  if (!changed || !element.animate) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [transform, origin] = entries[route] || ["translateX(13px)", "50% 50%"];
  element.animate([
    { opacity: reduced ? .92 : .75, transform: reduced ? "none" : transform, transformOrigin: origin },
    { opacity: 1, transform: "none", transformOrigin: origin },
  ], { duration: reduced ? 100 : 270, easing: "cubic-bezier(.16,1,.3,1)" });
}
