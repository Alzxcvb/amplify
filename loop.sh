#!/bin/bash

# Ralph Loop — amplify
# Runs Claude Code in a loop until all tasks are complete
# Usage: caffeinate bash loop.sh
# Stop:  Ctrl+C

set +e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLAN_FILE="$PROJECT_DIR/IMPLEMENTATION_PLAN.md"
RALPH_DIR="$PROJECT_DIR/.ralph"
LOG_FILE="$RALPH_DIR/run-$(date +%Y-%m-%d).log"

MAX_ITERATIONS=50
ITERATION=0
CONSECUTIVE_ERRORS=0
MAX_CONSECUTIVE_ERRORS=3
ERROR_COOLDOWN=60

TOTAL_ELAPSED=0
SUCCESS_COUNT=0
RUN_START=$(date +%s)

MAX_CALLS_PER_HOUR=30
CALL_COUNT_FILE="$RALPH_DIR/.calls"
CALL_RESET_FILE="$RALPH_DIR/.calls_reset"

# Tools Ralph is allowed to use — scoped to what this project needs
ALLOWED_TOOLS="Write,Read,Edit,MultiEdit,Bash(git add *),Bash(git commit *),Bash(git diff *),Bash(git log *),Bash(git status),Bash(git push *),Bash(git pull *),Bash(npm *),Bash(node *),Bash(npx *),Bash(mkdir *),Bash(ls *),Bash(cat *),Bash(touch *)"

mkdir -p "$RALPH_DIR"

log() {
    local msg="$1"
    echo "$msg" | tee -a "$LOG_FILE"
}

get_call_count() {
    local now
    now=$(date +%s)
    local reset_time=0
    if [ -f "$CALL_RESET_FILE" ]; then
        reset_time=$(cat "$CALL_RESET_FILE")
    fi
    if [ $((now - reset_time)) -ge 3600 ]; then
        echo "0" > "$CALL_COUNT_FILE"
        echo "$now" > "$CALL_RESET_FILE"
    fi
    if [ -f "$CALL_COUNT_FILE" ]; then
        cat "$CALL_COUNT_FILE"
    else
        echo "0"
    fi
}

increment_call_count() {
    local count
    count=$(get_call_count)
    echo $((count + 1)) > "$CALL_COUNT_FILE"
}

check_rate_limit() {
    local count
    count=$(get_call_count)
    if [ "$count" -ge "$MAX_CALLS_PER_HOUR" ]; then
        local reset_time now wait_secs
        reset_time=$(cat "$CALL_RESET_FILE")
        now=$(date +%s)
        wait_secs=$((3600 - (now - reset_time)))
        log "Rate limit reached ($count/$MAX_CALLS_PER_HOUR calls this hour). Waiting ${wait_secs}s..."
        sleep "$wait_secs"
        get_call_count > /dev/null
    fi
}

log "Starting Ralph Loop: amplify"
log "  Project:    $PROJECT_DIR"
log "  Max iter:   $MAX_ITERATIONS"
log "  Rate limit: $MAX_CALLS_PER_HOUR calls/hour"
log "  Log:        $LOG_FILE"
log ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    ITER_START=$(date +%s)

    log "================================================================"
    log "Iteration $ITERATION of $MAX_ITERATIONS  [$(date '+%H:%M:%S')]"
    log "================================================================"

    if [ -f "$PLAN_FILE" ]; then
        INCOMPLETE=$(grep -c "^- \[ \]" "$PLAN_FILE" 2>/dev/null | tr -cd '0-9' || echo "0")
        INCOMPLETE=${INCOMPLETE:-0}
        COMPLETE=$(grep -c "^- \[x\]" "$PLAN_FILE" 2>/dev/null | tr -cd '0-9' || echo "0")
        COMPLETE=${COMPLETE:-0}
        BLOCKED=$(grep -cE "^- (\[[x ]\] )?BLOCKED:" "$PLAN_FILE" 2>/dev/null | tr -cd '0-9' || echo "0")
        BLOCKED=${BLOCKED:-0}

        log "Status: $COMPLETE complete, $INCOMPLETE remaining, $BLOCKED blocked"

        if [ "$SUCCESS_COUNT" -gt 0 ] && [ "$INCOMPLETE" -gt 0 ]; then
            AVG_ITER=$((TOTAL_ELAPSED / SUCCESS_COUNT))
            ETA_SECS=$((INCOMPLETE * AVG_ITER))
            ETA_MIN=$((ETA_SECS / 60))
            RUN_NOW=$(date +%s)
            ELAPSED_SO_FAR=$(((RUN_NOW - RUN_START) / 60))
            log "ETA: ~${ETA_MIN} min remaining (avg ${AVG_ITER}s/task, ${ELAPSED_SO_FAR} min elapsed)"
        fi
        log ""

        if [ "$INCOMPLETE" -eq 0 ] 2>/dev/null; then
            log "All tasks complete! amplify is built."
            log "  Total iterations: $ITERATION"
            log "  Tasks completed:  $COMPLETE"
            exit 0
        fi

        if [ "$ITERATION" -gt 1 ] && [ "$INCOMPLETE" -gt 0 ] && [ "$INCOMPLETE" -eq "$LAST_INCOMPLETE" ] && [ "$LAST_INCOMPLETE" -eq "$PREV_INCOMPLETE" ]; then
            log "No progress for 2 iterations. Stopping for human review."
            grep -E "^- (\[[x ]\] )?BLOCKED:" "$PLAN_FILE" 2>/dev/null | tee -a "$LOG_FILE"
            exit 1
        fi
        PREV_INCOMPLETE=${LAST_INCOMPLETE:-$INCOMPLETE}
        LAST_INCOMPLETE=$INCOMPLETE
    fi

    check_rate_limit
    increment_call_count

    log "Running build iteration..."
    cd "$PROJECT_DIR"

    TEMP_OUTPUT=$(mktemp)
    trap "rm -f $TEMP_OUTPUT" EXIT

    RETRY=0
    MAX_RETRIES=3
    EXIT_CODE=1
    while [ $RETRY -lt $MAX_RETRIES ]; do
        claude -p --verbose --output-format stream-json \
            --allowedTools "$ALLOWED_TOOLS" \
            "Read PROMPT_build.md and follow its instructions. Pick the next incomplete task from IMPLEMENTATION_PLAN.md, implement it, verify it works, commit, and mark it complete." 2>&1 | \
            while IFS= read -r line; do
                echo "$line" >> "$TEMP_OUTPUT"
                if echo "$line" | grep -q '"type":"tool_use"'; then
                    TOOL=$(echo "$line" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')
                    FILEPATH=$(echo "$line" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p' | sed 's|.*/||')
                    CMD=$(echo "$line" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p' | head -c 40)
                    if [ -n "$TOOL" ]; then
                        if [ -n "$FILEPATH" ]; then
                            log "  > $TOOL: $FILEPATH"
                        elif [ -n "$CMD" ]; then
                            log "  > $TOOL: $CMD..."
                        else
                            log "  > $TOOL"
                        fi
                    fi
                elif echo "$line" | grep -q '"type":"result"'; then
                    if echo "$line" | grep -q '"is_error":false'; then
                        log "  Task complete"
                    else
                        log "  Task failed"
                    fi
                fi
            done
        EXIT_CODE=${PIPESTATUS[0]}
        OUTPUT=$(cat "$TEMP_OUTPUT")

        if echo "$OUTPUT" | grep -q "No messages returned"; then
            log "Claude API error (No messages returned) — recoverable"
            EXIT_CODE=1
        fi

        if [ $EXIT_CODE -eq 0 ]; then
            CONSECUTIVE_ERRORS=0
            break
        fi

        RETRY=$((RETRY + 1))
        if [ $RETRY -lt $MAX_RETRIES ]; then
            log "Claude failed (exit $EXIT_CODE), retry $RETRY of $MAX_RETRIES in 10s..."
            sleep 10
        fi
    done

    ITER_END=$(date +%s)
    ITER_ELAPSED=$((ITER_END - ITER_START))

    if [ $EXIT_CODE -ne 0 ]; then
        CONSECUTIVE_ERRORS=$((CONSECUTIVE_ERRORS + 1))
        log "Failed in ${ITER_ELAPSED}s (consecutive errors: $CONSECUTIVE_ERRORS/$MAX_CONSECUTIVE_ERRORS)"
        if [ $CONSECUTIVE_ERRORS -ge $MAX_CONSECUTIVE_ERRORS ]; then
            log "Too many consecutive errors. Stopping for human review."
            exit 1
        fi
        log "Cooling down for ${ERROR_COOLDOWN}s..."
        sleep $ERROR_COOLDOWN
    else
        TOTAL_ELAPSED=$((TOTAL_ELAPSED + ITER_ELAPSED))
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        log "Done in ${ITER_ELAPSED}s. Sleeping 15s before next iteration..."
        sleep 15
    fi
done

log "Max iterations ($MAX_ITERATIONS) reached."
exit 1
