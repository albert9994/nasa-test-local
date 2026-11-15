//! Small in-memory sliding-window rate limiter (per client key, e.g. IP).

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    limit: usize,
    window: Duration,
    hits: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn new(limit: usize, window: Duration) -> Self {
        Self {
            limit,
            window,
            hits: Mutex::default(),
        }
    }

    /// 20 requests per hour.
    pub fn per_hour(limit: usize) -> Self {
        Self::new(limit, Duration::from_secs(3600))
    }

    /// Records a hit. `Err(retry_after_secs)` when the key is over its limit.
    pub fn check(&self, key: &str) -> Result<(), u64> {
        let now = Instant::now();
        let Ok(mut map) = self.hits.lock() else {
            return Ok(());
        };
        if map.len() > 10_000 {
            map.retain(|_, q| {
                q.back()
                    .is_some_and(|t| now.duration_since(*t) < self.window)
            });
        }
        let q = map.entry(key.to_string()).or_default();
        while q
            .front()
            .is_some_and(|t| now.duration_since(*t) >= self.window)
        {
            q.pop_front();
        }
        if q.len() >= self.limit {
            let wait = q.front().map_or(self.window, |t| {
                self.window.saturating_sub(now.duration_since(*t))
            });
            return Err(wait.as_secs().max(1));
        }
        q.push_back(now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_limit_per_key() {
        let r = RateLimiter::per_hour(2);
        assert!(r.check("a").is_ok());
        assert!(r.check("a").is_ok());
        assert!(r.check("a").is_err());
        assert!(r.check("b").is_ok());
    }
}
