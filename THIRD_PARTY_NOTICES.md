# Third-party components

m3u8 Studio application code is MIT-licensed. The application starts the
following tools as separate processes.

## N_m3u8DL-RE

- Version: v0.6.0-beta, official nilaoda release.
- Source and license: https://github.com/nilaoda/N_m3u8DL-RE/tree/v0.6.0-beta
- License: MIT. Preserve tools/N_m3u8DL-RE.LICENSE.txt when redistributing.
- URLs and archive SHA-256 hashes are pinned in scripts/tools-manifest.json.

## FFmpeg in distribution builds

- Version: 6.1.6, unmodified official source from https://ffmpeg.org/releases/ffmpeg-6.1.6.tar.xz
- License: LGPL 2.1 or later. Distribution builds explicitly disable GPL and
  nonfree code and disable autodetection of external libraries. No external
  codec libraries such as x264, x265 or FDK-AAC are linked into this build.
- Full corresponding source is attached to releases as FFmpeg-6.1.6-Source.tar.xz.
  Its SHA-256 is pinned in scripts/tools-manifest.json.
- The complete build recipe is scripts/build-ffmpeg.cjs in the application
  Source.zip and repository. TOOLS.json records each target's actual configuration,
  compiler, version, source URL and hash. There are no source patches.
- Preserve the source attachment, build recipe, TOOLS.json,
  tools/FFmpeg.LICENSE.txt, COPYING.LGPLv2.1, FFmpeg.BUILD.txt and manifest.json
  when redistributing. Source.zip contains the application and build recipe;
  the separate FFmpeg source attachment contains the upstream implementation.
- Windows builds retain MinGW toolchain notices in tools/TOOLCHAIN-LICENSES.
  GCC runtime code is covered by the GCC Runtime Library Exception, and MinGW
  runtime components retain their own notices. Native system libraries are
  provided by the target operating system.
- This FFmpeg supports media muxing and decoding. Users can choose their own
  executable for features requiring external codecs.
- Upstream: https://ffmpeg.org/ ; guidance: https://ffmpeg.org/legal.html

## Development-only precompiled FFmpeg

Windows, Linux and Intel macOS development startup may use binaries from
https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1 . Platform assets
can contain different versions and use GPL or LGPL according to configuration.
They are not used by the current distribution build script. The Apple Silicon
asset is marked nonfree and rejected; that target uses the source build.

Earlier local packages using precompiled binaries lack their full corresponding
sources and should not be publicly redistributed as the current release.
Rebuild using this repository's source-build pipeline instead.

## Electron

Electron includes its LICENSE and LICENSES.chromium.html files. Keep these
notices when distributing an unpacked application.
Source: https://github.com/electron/electron
