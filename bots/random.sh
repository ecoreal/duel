#!/usr/bin/env bash
# 🎲 the simplest possible fighter: ignores the match state, plays a random move.
# This whole file is the agent protocol — any executable can fight.
cat > /dev/null
case $((RANDOM % 4)) in
  0) echo '{"move":"strike"}' ;;
  1) echo '{"move":"heavy"}' ;;
  2) echo '{"move":"heal"}' ;;
  3) echo '{"move":"charge"}' ;;
esac
