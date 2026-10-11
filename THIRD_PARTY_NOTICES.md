# Third-party components

m3u8 Studio application code is available under the MIT license in LICENSE.
The application starts the following tools as separate processes.

## N_m3u8DL-RE

- Version: v0.6.0-beta, official nilaoda release.
- Source and license: https://github.com/nilaoda/N_m3u8DL-RE/tree/v0.6.0-beta
- License: MIT. The full copyright notice is included in tools/N_m3u8DL-RE.LICENSE.txt.

## FFmpeg

- Binary distribution: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
- Different platform assets may contain different FFmpeg versions. See
  tools/FFmpeg.BUILD.txt and run the bundled ffmpeg -version for the exact
  version, compiler, enabled libraries and configuration.
- Preserve tools/FFmpeg.LICENSE.txt, COPYING.GPLv3, COPYING.LGPLv2.1,
  FFmpeg.BUILD.txt and manifest.json when redistributing this application.
- FFmpeg uses LGPL or GPL according to its build configuration; the bundled
  Windows/Linux builds use GPL. These licenses apply to the FFmpeg tools.
- FFmpeg upstream: https://ffmpeg.org/
- Source repository: https://github.com/FFmpeg/FFmpeg
- Windows build/source information: https://www.gyan.dev/ffmpeg/builds/
- Linux build/source information: https://johnvansickle.com/ffmpeg/
- macOS build/source information: https://evermeet.cx/ffmpeg/ and https://osxexperts.net/
- The manifest records the upstream asset URL and pinned SHA-256 hash.
  The build information identifies the upstream source versions and libraries.

This source archive contains the desktop application's source; it is not a
complete corresponding-source archive of FFmpeg and all of its linked libraries.
When publicly redistributing the bundled binaries, supply the corresponding
source and build information required by their licenses alongside the release.
See https://ffmpeg.org/legal.html for FFmpeg's distribution guidance.

## Electron

Electron is distributed with its own LICENSE and LICENSES.chromium.html files.
Keep these files when distributing an unpacked application.
Source: https://github.com/electron/electron
