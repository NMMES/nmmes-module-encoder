ffmpeg -hwaccel vaapi -vaapi_device /dev/dri/renderD128 -i f.mp4 -vf 'format=nv12|vaapi,hwupload' -threads 8 -c:v hevc_vaapi -preset slower -c:a libopus "f-new.mkv"

https://trac.ffmpeg.org/wiki/Hardware/VAAPI

vobsub2png
tesseract --oem 1 out.png stdout
