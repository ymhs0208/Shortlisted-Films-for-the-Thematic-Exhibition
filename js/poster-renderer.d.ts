export type PosterTemplateImage = HTMLImageElement & { exhibitionTemplateId?: string };

export type PosterRecordData = {
  code?: string;
  name?: string;
  className?: string;
  fit?: 'contain' | 'cover';
  image?: HTMLImageElement | null;
};

export type PosterTemplate = {
  id: string;
  name: string;
  src: string;
  poster: [number, number, number, number];
  fields: Array<[string, number, number, number, number, number?]>;
};

export function getPosterTemplate(id?: string | null): PosterTemplate;
export function renderPosterCanvas(
  canvas: HTMLCanvasElement,
  record: PosterRecordData,
  template: PosterTemplateImage | null,
  image?: HTMLImageElement | null,
): void;
