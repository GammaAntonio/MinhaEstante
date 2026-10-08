import { h, link } from "./ui.js";

export const CREATOR_BADGE_LABEL = "Creator";
export const CREATOR_BADGE_DESCRIPTION = "Criador da MinhaEstante";

export function creatorBadge(user) {
  if (!user?.isCreator) return null;

  return h(
    "details",
    { class: "creator-badge" },
    h(
      "summary",
      {
        title: `${CREATOR_BADGE_LABEL} · ${CREATOR_BADGE_DESCRIPTION}`,
        "aria-label": `${CREATOR_BADGE_LABEL} · ${CREATOR_BADGE_DESCRIPTION}`,
      },
      "✓",
    ),
    h(
      "span",
      { class: "creator-badge-popup" },
      h("strong", {}, CREATOR_BADGE_LABEL),
      h("span", {}, CREATOR_BADGE_DESCRIPTION),
    ),
  );
}

export function userIdentity(
  user,
  { username = false, linkProfile = false, className = "" } = {},
) {
  if (!user) return null;

  const label = username
    ? `@${user.username || ""}`
    : user.page?.displayName || `@${user.username || ""}`;

  const identityLabel =
    linkProfile && user.username
      ? link(label, `#/pagina/${user.username}`, {
          class: "user-identity-link",
        })
      : h("span", { class: "user-identity-label" }, label);

  return h(
    "span",
    { class: `user-identity${className ? ` ${className}` : ""}` },
    identityLabel,
    creatorBadge(user),
  );
}
