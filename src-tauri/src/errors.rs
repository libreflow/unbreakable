use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UnbreakableError {
    #[error("OS RNG unavailable: {0}")]
    Rng(String),

    #[error("invalid password options: {0}")]
    InvalidOptions(String),

    #[error("entropy below required threshold ({0:.2} bits)")]
    EntropyTooLow(f64),

    #[error("generation exceeded max attempts ({0})")]
    GenerationExhausted(u32),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("clipboard error: {0}")]
    Clipboard(String),
}

impl Serialize for UnbreakableError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, UnbreakableError>;
