const PATTERNS = [
  { name: 'ignore_instructions', regex: /ignore (previous|all|prior) instructions/i },
  { name: 'forget_everything', regex: /forget (everything|all)/i },
  { name: 'you_are_now', regex: /you are now/i },
  { name: 'system_tag', regex: /\[system\]/i },
  { name: 'new_task_persona', regex: /new (task|persona|role):/i },
  { name: 'sys_tag', regex: /<<SYS>>/i },
  { name: 'markdown_instruction', regex: /###\s*(instruction|system|prompt)/i },
  { name: 'disregard', regex: /disregard (previous|all)/i },
  { name: 'override', regex: /override (previous|all)/i },
  { name: 'act_as', regex: /act as/i },
  { name: 'jailbreak', regex: /jailbreak/i },
  { name: 'dan', regex: /\bDAN\b/ },
  { name: 'pretend_you', regex: /pretend you/i },
];

function detectInjection(text) {
  if (typeof text !== 'string') return { isInjection: false, pattern: null };

  if (text.length > 5000) {
    return { isInjection: true, pattern: 'text_too_long' };
  }

  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(text)) {
    return { isInjection: true, pattern: 'control_chars' };
  }

  for (const { name, regex } of PATTERNS) {
    if (regex.test(text)) {
      return { isInjection: true, pattern: name };
    }
  }

  return { isInjection: false, pattern: null };
}

module.exports = { detectInjection };
