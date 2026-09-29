"""A short video for each listing, made from its own photos: the cover, then the dashboard and two close-ups,
each with a slow zoom and a short fade between them. About 11 seconds; Etsy plays listing videos muted.

    python3 etsy/video.py [folder ...]     writes etsy/videos/<folder>.mp4 (git ignores that folder)

publish.py uploads the video of each listing that has one.
"""
import subprocess
import sys

import imageio_ffmpeg

import publish as P

W, H, FPS = 1600, 1200, 30
SHOW, FADE = 3.2, 0.5  # seconds on each photo, seconds of fade into the next


def pictures(li):
    """The cover first, then the other photos in order, leaving out the overview of all the tabs."""
    cover = [p for p in li["photos"] if p.name.startswith("00-")]
    rest = [p for p in li["photos"] if not p.name.startswith("00-") and "whats-inside" not in p.name]
    return (cover + rest)[:4]


def make(li):
    pics = pictures(li)
    frames = int(SHOW * FPS)
    args = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error"]
    for p in pics:
        args += ["-i", str(p)]
    # Each photo is enlarged first so the slow zoom (1.00 to 1.06, toward the centre) does not wobble.
    parts = [f"[{k}:v]scale={W * 2}:{H * 2},zoompan=z='1+0.06*on/{frames}':x='iw/2-(iw/zoom/2)':"
             f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p[v{k}]"
             for k in range(len(pics))]
    last = "v0"
    for k in range(1, len(pics)):
        parts.append(f"[{last}][v{k}]xfade=transition=fade:duration={FADE}:offset={k * (SHOW - FADE):.2f}[x{k}]")
        last = f"x{k}"
    P.VIDEOS.mkdir(exist_ok=True)
    dest = P.VIDEOS / f"{li['folder']}.mp4"
    args += ["-filter_complex", ";".join(parts), "-map", f"[{last}]", "-c:v", "libx264", "-preset", "medium",
             "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(dest)]
    subprocess.run(args, check=True)
    return dest


def main(folders):
    for li in P.listings():
        if not folders or li["folder"] in folders:
            print(make(li).name)


if __name__ == "__main__":
    main(sys.argv[1:])
