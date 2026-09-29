use crate::crypto::{generate_password, PasswordOptions};

#[tauri::command]
pub fn cmd_generate_password(opts: Option<PasswordOptions>) -> Result<String, String> {
    generate_password(&opts.unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_generate_passphrase(
    lang: crate::crypto::wordlist::WordlistLang,
    word_count: u8,
    separator: String,
    include_digit: bool,
    include_symbol: bool,
) -> Result<String, String> {
    let sep = separator.chars().next().unwrap_or('-');
    crate::crypto::wordlist::generate_passphrase(
        lang,
        word_count,
        sep,
        include_digit,
        include_symbol,
    )
    .map(|z| (*z).clone())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_generate_pair(
    pwd_opts: Option<crate::crypto::PasswordOptions>,
    lang: crate::crypto::wordlist::WordlistLang,
    word_count: u8,
    separator: String,
    include_digit: bool,
    include_symbol: bool,
) -> Result<(String, String), String> {
    let sep = separator.chars().next().unwrap_or('-');
    let pwd = crate::crypto::generate_password(&pwd_opts.unwrap_or_default())
        .map_err(|e| e.to_string())?;
    let phrase = crate::crypto::wordlist::generate_passphrase(
        lang,
        word_count,
        sep,
        include_digit,
        include_symbol,
    )
    .map(|z| (*z).clone())
    .map_err(|e| e.to_string())?;
    Ok((pwd, phrase))
}
