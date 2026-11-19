#!/bin/zsh
# usage: run.sh <name> <third-ref-image>  -> /tmp/whale-art/work/<name>/<name>.png   (prompt = common.txt + p_<name>.txt)
R=<local-path> T=$R/docs/whale/art; W=/tmp/whale-art/work; n=$1; ref=$2
mkdir -p $W/$n; cd $W/$n; rm -f $n.png
{ cat $T/common.txt; cat $T/p_$n.txt
  echo "Attached images: (1) the game's title painting, (2) a style reference, (3) the reference mentioned above. Use your image generation tool to create ONE square 1024x1024 image and save it as a PNG file named $n.png in the current directory. Do not write any code to draw it. When done, reply with only the file path."; } > prompt.txt
<local-path> exec -s workspace-write --skip-git-repo-check -i $R/public/assets/title-blind-plaza.webp -i $R/reference/ref-1.webp -i $ref - < prompt.txt > log.txt 2>&1
ls -la $W/$n/$n.png
