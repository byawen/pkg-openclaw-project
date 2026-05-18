{
  "env": {
    "OPENCLAW_RELAY_API_KEY": "YOUR_API_KEY_HERE",
    "OPENCLAW_RELAY_BASE_URL": "YOUR_BASE_URL_HERE"
  },
  "gateway": {
    "mode": "local",
    "port": 19003,
    "auth": {
      "mode": "token",
      "token": "YOUR_AUTH_TOKEN_HERE"
    },
    "bind": "loopback"
  },
  "agents": {
    "defaults": {
      "workspace": "YOUR_WORKSPACE_PATH_HERE",
      "sandbox": {
        "mode": "off"
      },
      "pdfMaxBytesMb": 100,
      "thinkingDefault": "off",
      "verboseDefault": "off",
      "compaction": {
        "mode": "default",
        "timeoutSeconds": 900,
        "reserveTokensFloor": 30000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 8000,
          "systemPrompt": "Session nearing compaction. Store durable memories now.",
          "prompt": "将本次对话中的关键信息追加到 memory/YYYY-MM-DD.md（不要覆盖已有内容）；如果有重要的长期信息，同时更新 MEMORY.md。完成后用 NO_REPLY 回复。"
        }
      },
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "4h",
        "keepLastAssistants": 5
      },
      "model": {
        "primary": "relay/tencent/hy3-preview"
      },
      "pdfModel": {
        "primary": "relay/moonshotai/kimi-k2.5"
      },
      "imageModel": {
        "primary": "relay/moonshotai/kimi-k2.5"
      },
      "imageGenerationModel": {
        "primary": "openai/image-gen-model"
      },
      "videoGenerationModel": {
        "primary": "openai/video-gen-model"
      },
      "memorySearch": {
        "enabled": false
      }
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "identity": {
          "name": "01Claw",
          "emoji": "🦞",
          "avatar": "avatars/ai-default.svg"
        },
        "workspace": "YOUR_WORKSPACE_PATH_HERE",
        "subagents": {
          "allowAgents": []
        }
      }
    ]
  },
  "session": {
    "dmScope": "per-account-channel-peer"
  },
  "tools": {
    "exec": {
      "security": "full",
      "ask": "off",
      "host": "gateway"
    },
    "fs": {
      "workspaceOnly": false
    },
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "webchat": [
          "*"
        ]
      }
    },
    "web": {
      "search": {
        "provider": "duckduckgo"
      },
      "fetch": {
        "enabled": true
      }
    },
    "profile": "full"
  },
  "browser": {
    "ssrfPolicy": {
      "dangerouslyAllowPrivateNetwork": true
    },
    "enabled": true,
    "evaluateEnabled": true
  },
  "models": {
    "providers": {
      "relay": {
        "baseUrl": "${OPENCLAW_RELAY_BASE_URL}",
        "api": "openai-completions",
        "models": [
          {
            "id": "tencent/hy3-preview",
            "name": "tencent/hy3-preview",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "deepseek/deepseek-v4-pro",
            "name": "deepseek/deepseek-v4-pro",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "deepseek-ai/DeepSeek-V4-Flash",
            "name": "deepseek-ai/DeepSeek-V4-Flash",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "gpt-5.5",
            "name": "gpt-5.5",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "minimax/minimax-m2.5",
            "name": "minimax/minimax-m2.5",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "z-ai/glm-5.1",
            "name": "z-ai/glm-5.1",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "deepseek/deepseek-r1",
            "name": "deepseek/deepseek-r1",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "moonshotai/kimi-k2-thinking",
            "name": "moonshotai/kimi-k2-thinking",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "moonshotai/kimi-k2.5",
            "name": "moonshotai/kimi-k2.5",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "moonshotai/kimi-k2.6",
            "name": "moonshotai/kimi-k2.6",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "z-ai/glm-4.7",
            "name": "z-ai/glm-4.7",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "z-ai/glm-5",
            "name": "z-ai/glm-5",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "deepseek/deepseek-v3.2",
            "name": "deepseek/deepseek-v3.2",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "google/gemini-2.5-flash",
            "name": "google/gemini-2.5-flash",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "google/gemini-2.5-pro",
            "name": "google/gemini-2.5-pro",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "google/gemini-3.1-pro-preview",
            "name": "google/gemini-3.1-pro-preview",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "anthropic/claude-sonnet-4.6",
            "name": "anthropic/claude-sonnet-4.6",
            "input": [
              "text",
              "image"
            ]
          },
          {
            "id": "anthropic/claude-opus-4.7",
            "name": "anthropic/claude-opus-4.7",
            "input": [
              "text",
              "image"
            ]
          }
        ],
        "apiKey": "${OPENCLAW_RELAY_API_KEY}"
      },
      "openai": {
        "baseUrl": "${OPENCLAW_RELAY_BASE_URL}",
        "api": "openai-completions",
        "apiKey": "${OPENCLAW_RELAY_API_KEY}",
        "models": [
          {
            "id": "image-gen-model",
            "name": "image-gen-model"
          },
          {
            "id": "video-gen-model",
            "name": "video-gen-model"
          }
        ]
      }
    },
    "mode": "merge"
  },
  "plugins": {
    "entries": {
      "openai": {
        "enabled": true,
        "config": {}
      },
      "duckduckgo": {
        "enabled": true
      },
      "browser": {
        "enabled": true
      }
    },
    "allow": [
      "openai",
      "duckduckgo",
      "browser",
      "memory-core"
    ]
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "hash",
    "ownerDisplaySecret": "YOUR_OWNER_SECRET_HERE"
  },
  "skills": {
    "load": {
      "extraDirs": [
        "YOUR_SKILLS_EXTRA_DIR_HERE"
      ]
    }
  },
  "meta": {
    "lastTouchedVersion": "2026.4.15",
    "lastTouchedAt": "ISO_DATE_HERE"
  }
}
