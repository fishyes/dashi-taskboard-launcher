//! schema：内置 + 磁盘托管参数的加载、合并与按界面语言取值

use std::path::PathBuf;

use crate::config;
use crate::i18n::trf;

use super::GuardParam;

const BUILTIN_SCHEMA: &str = include_str!("guard_schema.json");

/// 按界面语言挑文案：en 且有英文资源时用英文，否则用原文（纯函数，便于测试）
pub(crate) fn pick_i18n<'a>(primary: &'a str, en: &'a str, lang: &str) -> &'a str {
    if lang == "en" && !en.is_empty() {
        en
    } else {
        primary
    }
}

/// 按界面语言挑 default 值：en 且有英文内容时用英文，否则用原文（纯函数，便于测试）
pub(crate) fn default_for_lang<'a>(p: &'a GuardParam, lang: &str) -> &'a serde_json::Value {
    if lang == "en" && !p.default_en.is_null() {
        &p.default_en
    } else {
        &p.default
    }
}

pub(crate) fn schema_file_path() -> Result<PathBuf, String> {
    Ok(config::home_dir()?
        .join(".codex-pro-max")
        .join("codex-guard-schema.json"))
}

/// 加载 schema：内置 schema 是内置参数的唯一权威（含 default 内容与英文资源）；
/// 磁盘文件只承载用户自定义参数（custom=true）。磁盘上的内置同名条目与已从内置移除的
/// 旧条目（化石）在加载时忽略，有丢弃时把清理后的自定义集回写磁盘——否则旧版本释放到
/// 磁盘的副本会永久滞留，复活已废弃的默认值与已删除的托管条目（实机踩坑）
pub(crate) fn load_schema() -> Vec<GuardParam> {
    let builtin = builtin_schema();

    let path = match schema_file_path() {
        Ok(p) => p,
        Err(_) => return builtin,
    };
    if !path.exists() {
        // 首次运行释放空的自定义集；磁盘文件只承载自定义参数
        let _ = save_disk_schema(&[]);
        return builtin;
    }
    let disk: Vec<GuardParam> = match std::fs::read_to_string(&path) {
        Ok(c) => match serde_json::from_str(&c) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("[看守 schema] 磁盘 schema 解析失败，已回退内置: {}", e);
                Vec::new()
            }
        },
        Err(e) => {
            log::warn!("[看守 schema] 磁盘 schema 读取失败，已回退内置: {}", e);
            Vec::new()
        }
    };

    let (customs, dropped) = sanitize_disk(disk, &builtin);
    if dropped > 0 {
        log::info!("[看守 schema] 清理 {} 条过时磁盘条目（化石/内置同名）", dropped);
        let _ = save_disk_schema(&customs);
    }
    let mut merged = builtin;
    merged.extend(customs);
    merged
}

fn builtin_schema() -> Vec<GuardParam> {
    serde_json::from_str(BUILTIN_SCHEMA).expect("内置 guard schema 必须可解析")
}

/// 磁盘条目清洗（纯函数，便于测试）：只保留自定义参数；内置同 id 条目一律丢弃
/// （内置为唯一权威），非自定义的未知条目是从旧内置移除的化石，同样丢弃
fn sanitize_disk(disk: Vec<GuardParam>, builtin: &[GuardParam]) -> (Vec<GuardParam>, usize) {
    let mut kept = Vec::new();
    let mut dropped = 0usize;
    for d in disk {
        if d.custom && !builtin.iter().any(|b| b.id == d.id) {
            kept.push(d);
        } else {
            dropped += 1;
        }
    }
    (kept, dropped)
}

/// 加载磁盘上的自定义参数（内置同 id 与化石条目在此视为不存在；
/// 文件本身的回写清理由 load_schema 在有丢弃时完成）
pub(crate) fn load_disk_schema() -> Result<Vec<GuardParam>, String> {
    let path = schema_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| {
            crate::logging::warn("看守 schema 读取", &e.to_string());
            trf("Failed to read schema file: {error}", &[("error", e.to_string())])
        })?;
    let schema: Vec<GuardParam> = serde_json::from_str(&content)
        .map_err(|e| {
            crate::logging::warn("看守 schema 解析", &e.to_string());
            trf("Failed to parse schema file: {error}", &[("error", e.to_string())])
        })?;
    Ok(sanitize_disk(schema, &builtin_schema()).0)
}

pub(crate) fn save_disk_schema(schema: &[GuardParam]) -> Result<(), String> {
    let path = schema_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| {
                crate::logging::error("看守 schema 写目录", &e.to_string());
                trf("Failed to create schema directory: {error}", &[("error", e.to_string())])
            })?;
    }
    let content = serde_json::to_string_pretty(schema)
        .map_err(|e| {
            crate::logging::error("看守 schema 序列化", &e.to_string());
            trf("Failed to serialize schema: {error}", &[("error", e.to_string())])
        })?;
    std::fs::write(&path, content)
        .map_err(|e| {
            crate::logging::error("看守 schema 写入", &e.to_string());
            trf("Failed to write schema file: {error}", &[("error", e.to_string())])
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_schema_parses() {
        let v: Vec<GuardParam> = serde_json::from_str(BUILTIN_SCHEMA).unwrap();
        assert_eq!(v.len(), 19);
    }

    #[test]
    fn builtin_schema_has_english_labels() {
        // 内置参数必须带英文资源，否则英文界面落回中文原文
        let v: Vec<GuardParam> = serde_json::from_str(BUILTIN_SCHEMA).unwrap();
        for p in &v {
            assert!(!p.label_en.is_empty(), "{} 缺 label_en", p.id);
            assert!(!p.description_en.is_empty(), "{} 缺 description_en", p.id);
        }
    }

    #[test]
    fn pick_i18n_selects_by_language() {
        // en 有英文资源 → 英文；无英文资源（自定义参数）→ 落回原文；zh → 原文
        assert_eq!(pick_i18n("中文", "English", "en"), "English");
        assert_eq!(pick_i18n("自定义", "", "en"), "自定义");
        assert_eq!(pick_i18n("中文", "English", "zh-CN"), "中文");
    }

    #[test]
    fn sanitize_disk_keeps_only_custom_params() {
        // 化石回归：内置同 id 的磁盘副本（旧版释放/手改）与已从内置移除的旧条目都丢弃；
        // 只有自定义参数（custom=true 且不抢内置 id）保留
        let json = |id: &str, custom: bool| {
            serde_json::from_value::<GuardParam>(serde_json::json!({
                "id": id, "label": "x", "file": "config.toml", "apply_mode": "toml_key",
                "value_type": "bool", "default": true, "custom": custom,
            }))
            .unwrap()
        };
        let builtin = vec![json("a", false)];
        let disk = vec![
            json("a", false),           // 内置同 id 的磁盘副本 → 丢弃（内置为唯一权威）
            json("removed.old", false), // 已从内置移除的化石 → 丢弃
            json("a", true),            // 自定义但抢占内置 id → 丢弃
            json("custom.x", true),     // 正常自定义 → 保留
        ];
        let (kept, dropped) = sanitize_disk(disk, &builtin);
        assert_eq!(dropped, 3);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].id, "custom.x");
        assert!(kept[0].custom);
    }

    #[test]
    fn default_for_lang_selects_content_by_language() {
        let p = |default_en: serde_json::Value| GuardParam {
            id: "x".into(),
            label: "中文".into(),
            label_en: String::new(),
            description: String::new(),
            description_en: String::new(),
            file: "f".into(),
            apply_mode: "file_overwrite".into(),
            path: String::new(),
            value_type: "text".into(),
            default: serde_json::json!("中文内容"),
            default_en,
            custom: false,
        };
        // en + 有英文内容 → 英文；en + 无英文内容 → 原文；zh → 原文
        let with_en = p(serde_json::json!("English content"));
        assert_eq!(default_for_lang(&with_en, "en"), &serde_json::json!("English content"));
        assert_eq!(default_for_lang(&with_en, "zh-CN"), &serde_json::json!("中文内容"));
        let without_en = p(serde_json::Value::Null);
        assert_eq!(default_for_lang(&without_en, "en"), &serde_json::json!("中文内容"));
    }

    #[test]
    fn builtin_schema_has_no_custom_flag() {
        let builtin: Vec<GuardParam> = serde_json::from_str(BUILTIN_SCHEMA).unwrap();
        for p in &builtin {
            assert!(!p.custom, "内置参数 {} 不应有 custom=true", p.id);
        }
    }
}
