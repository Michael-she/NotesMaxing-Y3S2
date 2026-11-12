"""
Prepares a lecture video for a video notes page: a timestamped transcript and the key frames.

Usage (from the repo root):
    python video_notes.py VIDEO [--out DIR] [--model small] [--every 2] [--change 0.5] [--scene 8] [--no-transcript] [--at mm:ss,...]

Writes, into DIR (default inbox/video/<video name>/, which is never committed):
    transcript.md     the speech in paragraphs of about 30 s, each starting with its [mm:ss] time
    transcript.json   the same, segment by segment: {"start": s, "end": s, "text": ...}
    frames/           candidate key frames, f_mmss.jpg, 1280 px wide: a frame is kept when the picture
                      has changed since the last kept one (new writing, a new slide); before a whole
                      new picture the frame showing the finished page is kept too, and so is the last
    contact.jpg       all candidate frames on one sheet with their times, for choosing quickly
    info.json         duration, size, and the list of frames with their times
    at/               with --at, frames grabbed at exactly those times (for a page you have
                      already seen in the transcript but the automatic pick missed)

The page itself is then written from these by hand or by a model, following NOTES_GUIDE.md section
A11 (video notes pages). Only the frames the page uses are copied next to it, in <page name>_frames/.

Needs PyAV, Pillow and faster-whisper (pip install av pillow faster-whisper). The first run downloads
the speech model (about 0.5 GB for "small"). Transcription runs on the CPU: expect roughly a third of
the video's length for the small model.
"""
import argparse
import json
import os
import sys

import av
from PIL import Image, ImageChops, ImageDraw, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))


def mmss(t):
    t = int(round(t))
    return f"{t // 3600}:{t // 60 % 60:02d}:{t % 60:02d}" if t >= 3600 else f"{t // 60:02d}:{t % 60:02d}"


def changed(a, b):
    """Percentage of pixels that changed sharply between two small grey frames: new writing or a new
    slide changes few pixels by a lot, while lighting or compression noise changes many by a little."""
    d = ImageChops.difference(a, b).point(lambda v: 255 if v > 40 else 0)
    return 100.0 * ImageStat.Stat(d).mean[0] / 255.0


def frames(video, out, every, change, scene):
    """Sample a frame every `every` seconds. Keep it when more than `change` % of the picture has
    changed since the last kept frame. When the change is a whole new picture (more than `scene` %:
    a new slide, a page scrolled or cleared), also keep the frame just before it, which shows the
    finished page. The last frame of the video is always kept."""
    os.makedirs(os.path.join(out, "frames"), exist_ok=True)
    kept, last, prev, next_t = [], None, None, 0.0

    def save(t, img, pct, why):
        if kept and kept[-1]["t"] == round(t, 1):
            return
        w = min(1280, img.width)
        im = img.resize((w, round(img.height * w / img.width)))
        name = f"f_{mmss(t).replace(':', '')}.jpg"
        im.save(os.path.join(out, "frames", name), quality=82, optimize=True)
        kept.append({"t": round(t, 1), "time": mmss(t), "file": "frames/" + name, "change": round(pct, 2), "why": why})

    with av.open(video) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        duration = float(c.duration / av.time_base) if c.duration else float(st.duration * st.time_base)
        size = (st.codec_context.width, st.codec_context.height)
        for fr in c.decode(st):
            t = float(fr.pts * st.time_base) if fr.pts is not None else next_t
            if t < next_t:
                continue
            next_t = t + every
            img = fr.to_image()
            small = img.convert("L").resize((192, 108))
            pct = 100.0 if last is None else changed(small, last)
            if pct >= change:
                if last is not None and pct >= scene and prev is not None and prev[1] is not last:
                    save(prev[0], prev[2], 0, "finished page before a new one")
                save(t, img, pct, "new picture" if pct >= scene else "new writing")
                last = small
            prev = (t, small, img)
        if prev is not None:
            save(prev[0], prev[2], 0, "end of the video")
    return duration, size, kept


def contact(out, kept):
    if not kept:
        return
    tw, th, cols = 320, 180, 4
    rows = (len(kept) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * (th + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, k in enumerate(kept):
        im = Image.open(os.path.join(out, k["file"])).convert("RGB")
        im.thumbnail((tw, th))
        x, y = i % cols * tw, i // cols * (th + 22)
        sheet.paste(im, (x, y + 20))
        d.text((x + 4, y + 4), k["time"], fill=(0, 0, 0))
    sheet.save(os.path.join(out, "contact.jpg"), quality=80)


def audio16k(video):
    """The soundtrack as 16 kHz mono float32 samples, decoded here (faster-whisper's own loader
    does not work with every PyAV version)."""
    import numpy as np
    rs = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    with av.open(video) as c:
        for fr in c.decode(c.streams.audio[0]):
            for o in rs.resample(fr):
                chunks.append(o.to_ndarray().reshape(-1))
        for o in rs.resample(None):
            chunks.append(o.to_ndarray().reshape(-1))
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def transcribe(video, out, model_name):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio16k(video), vad_filter=True, beam_size=5)
    segs = []
    for s in segments:
        segs.append({"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()})
        print(f"\r  transcribed to {mmss(s.end)}", end="", flush=True)
    print()
    with open(os.path.join(out, "transcript.json"), "w", encoding="utf-8") as fh:
        json.dump({"language": info.language, "segments": segs}, fh, ensure_ascii=False, indent=1)
    # paragraphs of about 30 s
    paras, cur, start = [], [], None
    for s in segs:
        start = s["start"] if start is None else start
        cur.append(s["text"])
        if s["end"] - start >= 30:
            paras.append(f"[{mmss(start)}] " + " ".join(cur)); cur, start = [], None
    if cur:
        paras.append(f"[{mmss(start)}] " + " ".join(cur))
    with open(os.path.join(out, "transcript.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# Transcript of {os.path.basename(video)}\n\nMachine transcription ({model_name} model); "
                 "check technical words and numbers against the frames.\n\n" + "\n\n".join(paras) + "\n")
    return len(segs)


def grab(video, out, times):
    """Save the frame at (or just after) each requested time, in mm:ss or seconds."""
    os.makedirs(os.path.join(out, "at"), exist_ok=True)
    secs = sorted(sum(float(p) * 60 ** i for i, p in enumerate(reversed(t.split(":")))) for t in times)
    got = []
    with av.open(video) as c:
        st = c.streams.video[0]
        for want in secs:
            c.seek(int(max(0, want - 2) / st.time_base), stream=st, backward=True)
            for fr in c.decode(st):
                t = float(fr.pts * st.time_base)
                if t >= want:
                    name = f"at/f_{mmss(t).replace(':', '')}.jpg"
                    img = fr.to_image(); w = min(1280, img.width)
                    img.resize((w, round(img.height * w / img.width))).save(os.path.join(out, name), quality=82, optimize=True)
                    got.append(name); break
    return got


def main():
    ap = argparse.ArgumentParser(description="Transcript and key frames for a video notes page.")
    ap.add_argument("video")
    ap.add_argument("--out", help="output folder (default inbox/video/<video name>/)")
    ap.add_argument("--model", default="small", help="faster-whisper model: tiny, base, small, medium (default small)")
    ap.add_argument("--every", type=float, default=2.0, help="seconds between sampled frames (default 2)")
    ap.add_argument("--change", type=float, default=0.5, help="%% of pixels that must change for a new frame (default 0.5)")
    ap.add_argument("--scene", type=float, default=8.0, help="%% change that counts as a whole new picture (default 8)")
    ap.add_argument("--no-transcript", action="store_true", help="key frames only")
    ap.add_argument("--at", help="only grab frames at these times (comma-separated mm:ss or seconds), into at/")
    a = ap.parse_args()
    if not os.path.isfile(a.video):
        sys.exit("No such video: " + a.video)
    out = a.out or os.path.join(HERE, "inbox", "video", os.path.splitext(os.path.basename(a.video))[0])
    os.makedirs(out, exist_ok=True)
    if a.at:
        for name in grab(a.video, out, [t.strip() for t in a.at.split(",") if t.strip()]):
            print("  " + os.path.join(out, name))
        return
    print("Key frames...")
    duration, size, kept = frames(a.video, out, a.every, a.change, a.scene)
    contact(out, kept)
    n = 0
    old = os.path.join(out, "transcript.json")
    if a.no_transcript and os.path.exists(old):        # keep the count from an earlier run
        with open(old, encoding="utf-8") as fh:
            n = len(json.load(fh)["segments"])
    if not a.no_transcript:
        print("Transcript...")
        n = transcribe(a.video, out, a.model)
    with open(os.path.join(out, "info.json"), "w", encoding="utf-8") as fh:
        json.dump({"video": os.path.basename(a.video), "duration": round(duration, 1), "length": mmss(duration),
                   "size": size, "frames": kept, "segments": n}, fh, indent=1)
    print(f"{mmss(duration)} of video: {len(kept)} key frames, {n} transcript segments, in {out}")


if __name__ == "__main__":
    main()
