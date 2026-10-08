const VARIANT_FIELDS = [
  'title',
  'subtitle',
  'bio',
  'avatar',
  'banner',
  'favoriteGenres',
  'links',
  'customization',
  'gadgets',
  'badges',
  'customCode',
];

const clone = (value) => structuredClone(value);

function capture(page) {
  return Object.fromEntries(VARIANT_FIELDS.map((key) => [key, clone(page[key])]));
}

export function ensureMediaPages(page) {
  let changed = false;
  if (!page.mediaPages || typeof page.mediaPages !== 'object') {
    page.mediaPages = {};
    changed = true;
  }
  if (!page.mediaPages.books) {
    page.mediaPages.books = capture(page);
    changed = true;
  }
  if (!page.mediaPages.albums) {
    const albums = capture(page);
    albums.title = page.title?.replace(/estante/gi, 'discoteca') || page.title;
    albums.subtitle = page.subtitle
      ? `${page.subtitle} · álbuns e faixas`
      : 'álbuns, faixas e outras coisas';
    page.mediaPages.albums = albums;
    changed = true;
  }
  return changed;
}

export function mediaKey(value) {
  return value === 'albums' ? 'albums' : 'books';
}

export function mediaVariant(page, media = 'books') {
  ensureMediaPages(page);
  return page.mediaPages[mediaKey(media)];
}

export function activateVariant(page, media = 'books') {
  const variant = mediaVariant(page, media);
  for (const key of VARIANT_FIELDS) page[key] = clone(variant[key]);
  return page;
}

export function saveVariant(page, media = 'books') {
  ensureMediaPages(page);
  page.mediaPages[mediaKey(media)] = capture(page);
  return page.mediaPages[mediaKey(media)];
}

export function syncLegacyBooks(page) {
  ensureMediaPages(page);
  const books = page.mediaPages.books;
  for (const key of VARIANT_FIELDS) page[key] = clone(books[key]);
  return page;
}

export function mediaUser(user, media = 'books') {
  ensureMediaPages(user.page);
  const variant = mediaVariant(user.page, media);
  return {
    ...user,
    page: {
      ...user.page,
      ...clone(variant),
      displayName: user.page.displayName,
      music: user.page.music,
      mediaPages: user.page.mediaPages,
      _media: mediaKey(media),
    },
  };
}

export function copyVariantSection(page, from, to, section = 'all') {
  ensureMediaPages(page);
  const source = page.mediaPages[mediaKey(from)];
  const target = page.mediaPages[mediaKey(to)];
  const copy = (key) => (target[key] = clone(source[key]));

  if (section === 'about') {
    ['title', 'subtitle', 'bio', 'favoriteGenres', 'links'].forEach(copy);
    target.customization.headerStyle = source.customization.headerStyle;
  } else if (section === 'images') ['avatar', 'banner', 'badges'].forEach(copy);
  else if (section === 'appearance') {
    for (const key of [
      'primaryColor',
      'secondaryColor',
      'linkColor',
      'backgroundColor',
      'pageColor',
      'panelColor',
      'textColor',
      'backgroundPattern',
      'sidebarPosition',
      'sidebarWidth',
    ]) target.customization[key] = clone(source.customization[key]);
  } else if (section === 'fonts') {
    target.customization.fontFamily = source.customization.fontFamily;
    target.customization.headingFont = source.customization.headingFont;
  } else if (section === 'wall') {
    for (const key of ['wallStyle', 'reviewStyle', 'wallContent'])
      target.customization[key] = clone(source.customization[key]);
  } else if (section === 'gadgets') copy('gadgets');
  else if (section === 'advanced') copy('customCode');
  else if (section === 'music') return target;
  else {
    for (const key of VARIANT_FIELDS) copy(key);
  }
  return target;
}

export function copyAppearance(page, from, to) {
  ensureMediaPages(page);
  const source = page.mediaPages[mediaKey(from)];
  const target = page.mediaPages[mediaKey(to)];
  target.customization = clone(source.customization);
  target.gadgets = clone(source.gadgets);
  target.customCode = clone(source.customCode);
  return target;
}

export const variantFields = () => [...VARIANT_FIELDS];
