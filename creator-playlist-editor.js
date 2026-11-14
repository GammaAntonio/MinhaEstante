import { h, button, input, check, field, guarded } from "./ui.js";
import { uploadMP3 } from "./music.js";
import {
  creatorTracks,
  MAX_CREATOR_TRACKS,
  MAX_TRACK_BYTES
} from "./creator-playlist.js";

export function renderCreatorMusicEditor({ user, draft, body, setUploading }) {
  const music = draft.music;
  const tracks = creatorTracks({ ...user, page: draft }).map(t => ({ ...t }));
  const rows = h("div", { class: "creator-playlist-editor" });
  let busy = false;

  function sync() {
    music.tracks = tracks
      .filter(t => t.fileId || t.url)
      .map(t => ({ ...t }));

    const first = music.tracks[0];

    music.fileId = first?.fileId || "";
    music.url = first?.url || "";
    music.fileName = first?.fileName || "";
    music.title = first?.title || "";

    if (!first) music.enabled = false;
  }

  function renderRows() {
    rows.replaceChildren();

    tracks.forEach((track, index) => {
      const title = input(`creatorTitle${index}`, track.title || "", {
        maxlength: 140,
        placeholder: "Ex.: Fresno - O Que Sobrou"
      });

      title.addEventListener("input", () => {
        track.title = title.value;
        sync();
      });

      const upload = input(`creatorFile${index}`, "", {
        type: "file",
        accept: ".mp3,audio/mpeg"
      });

      const status = h(
        "small",
        { class: "muted", role: "status" },
        track.fileName || "Nenhum MP3 enviado."
      );

      upload.addEventListener("change", guarded(async () => {
        const file = upload.files?.[0];

        if (!file || busy) return;

        if (file.size > MAX_TRACK_BYTES) {
          throw new Error("Cada MP3 pode ter no máximo 50 MB.");
        }

        busy = true;
        setUploading(true);
        upload.disabled = true;
        status.textContent = "Enviando MP3...";

        try {
          const uploaded = await uploadMP3(file);

          Object.assign(track, uploaded, { url: "" });

          if (!track.title.trim()) {
            track.title = file.name.replace(/\.mp3$/i, "");
          }

          music.enabled = true;
          sync();
        } finally {
          busy = false;
          setUploading(false);
          renderRows();
        }
      }));

      rows.append(
        h("div", { class: "editor-section" },
          h("strong", {}, `Música ${index + 1}`),
          field("Nome da música e artista", title),
          field("Arquivo MP3 (máximo 50 MB)", upload),
          status,
          button("Remover esta faixa", () => {
            if (busy) return;

            tracks.splice(index, 1);
            sync();
            renderRows();
          })
        )
      );
    });

    const add = button("Adicionar música", () => {
      if (busy || tracks.length >= MAX_CREATOR_TRACKS) return;

      tracks.push({
        title: "",
        fileId: "",
        fileName: "",
        url: ""
      });

      renderRows();
    });

    add.disabled = busy || tracks.length >= MAX_CREATOR_TRACKS;

    rows.append(
      h("p", { class: "muted" },
        `${tracks.length} de ${MAX_CREATOR_TRACKS} músicas`
      ),
      add
    );
  }

  const disabled = check("Não tocar música", !music.enabled);

  disabled.querySelector("input").addEventListener("change", e => {
    music.enabled = !e.target.checked;
  });

  const loop = check(
    "Recomeçar playlist depois da última música",
    music.loop
  );

  loop.querySelector("input").addEventListener("change", e => {
    music.loop = e.target.checked;
  });

  sync();
  renderRows();

  body.append(
    h("h3", {}, "Playlist do Creator"),
    h("p", {}, "Até 20 arquivos MP3 de 50 MB cada."),
    disabled,
    loop,
    rows,
    h("p", { class: "muted" },
      "Clique em Salvar alterações para publicar sua playlist."
    )
  );
}
