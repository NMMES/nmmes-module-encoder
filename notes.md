ffmpeg -hwaccel vaapi -vaapi_device /dev/dri/renderD128 -i f.mp4 -vf 'format=nv12|vaapi,hwupload' -threads 8 -c:v hevc_vaapi -preset slower -c:a libopus "f-new.mkv"

https://trac.ffmpeg.org/wiki/Hardware/VAAPI

# Hw decoding and hw encoding a jpeg previews
ffmpeg -hwaccel vaapi -vaapi_device /dev/dri/renderD128 -hwaccel_output_format vaapi -i "/home/ayrton/Videos/Dragonball Z Remastered Seasons 1-9 + Movies Pack/Dragon Ball Z Remastered Season 1 [Triple-Audio]/DBZ - 001 - The New Threat.mkv" -y -filter_complex "[0:v]split=2[v0][v1];[v1]fps=3[v1];[v0]hwdownload,format=nv12[video]" -map "[video]" -c:v libx265 -crf 19 -preset ultrafast /tmp/out.mkv -map "[v1]" -c:v mjpeg_vaapi -f image2 -updatefirst 1 /tmp/dbz.jpeg

# Hw decoding and hw encoding x265 and a jpeg previews
ffmpeg -hwaccel vaapi -vaapi_device /dev/dri/renderD128 -hwaccel_output_format vaapi -i "/home/ayrton/Videos/Dragonball Z Remastered Seasons 1-9 + Movies Pack/Dragon Ball Z Remastered Season 1 [Triple-Audio]/DBZ - 001 - The New Threat.mkv" -y -filter_complex "[0:v]split=2[v0][v1];[v1]fps=3[v1]" -map "[v0]" -c:v hevc_vaapi -qp 19 -preset ultrafast /tmp/out.mkv -map "[v1]" -c:v mjpeg_vaapi -f image2 -updatefirst 1 /tmp/dbz.jpeg

ffmpeg -i "/home/ayrton/Videos/Dragonball Z Remastered Seasons 1-9 + Movies Pack/Dragon Ball Z Remastered Season 1 [Triple-Audio]/DBZ - 001 - The New Threat.mkv" -y -filter_complex "[0:v]split=2[v0][v1];[v1]fps=3[v1]" -map "[v0]" -c:v libx265 -crf 19 -preset ultrafast /tmp/out.mkv -map "[v1]" -c:v mjpeg -f image2 -updatefirst 1 /tmp/dbz.jpeg

# Pause/Resume
https://video.stackexchange.com/questions/17061/is-there-a-way-to-pause-and-resume-ffmpeg-encoding/20561
