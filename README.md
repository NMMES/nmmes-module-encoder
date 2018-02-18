# NMMES-module-encoder

An encoder module for nmmes-backend.

## Dependencies

- [nmmes-backend](https://github.com/NMMES/nmmes-backend) - Required in order to run this module.

### Installation
[![NPM](https://nodei.co/npm/nmmes-module-encoder.png?compact=true)](https://nodei.co/npm/nmmes-module-encoder/)

## Options

The `--preview` option ensures the encoder only encodes a segment as long as defined by `--preview-length`.

Type: Boolean<br>
Default: false

---

The `--preview-length` option specifies the length of a preview in preview mode and/or a sample in milliseconds.

Type: Number<br>
Default: 30000 (30 seconds)

---

The `--destination` option allows you to choose where finished encodes should be deposited.

Type: String<br>
Default: A folder named nmmes-out in your [current working directory](https://www.computerhope.com/jargon/c/currentd.htm).

---

The `--quality` option sets the container to store the finished encode in. This option is only technically limited to ffmpegs muxing ability and container codec compatibility. More options can be found in ffmpeg's [file format support](https://www.ffmpeg.org/general.html#File-Formats) and [muxing support](https://ffmpeg.org/ffmpeg-formats.html#Muxers) documentation.

Type: Number<br>
Default: 19

---

The `--video-codec` option sets the

Type: String<br>
Options: libx265, libx264<br>
Default: libx265
