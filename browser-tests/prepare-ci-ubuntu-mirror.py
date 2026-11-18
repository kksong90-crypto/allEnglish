"""Use the standard signed Ubuntu archive in disposable Linux CI runners."""
from pathlib import Path
import re


def standard_archive(text):
    return re.sub(
        r"https?://[a-z0-9-]+\.ec2\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)",
        "https://archive.ubuntu.com/ubuntu",
        text,
        flags=re.IGNORECASE,
    )


def main():
    paths = [Path("/etc/apt/sources.list")]
    root = Path("/etc/apt/sources.list.d")
    paths += list(root.glob("*.list")) + list(root.glob("*.sources"))
    changed = 0
    for path in paths:
        if not path.is_file():
            continue
        before = path.read_text()
        after = standard_archive(before)
        if before != after:
            path.write_text(after)
            changed += 1
    Path("/etc/apt/apt.conf.d/99allbarun-browser-download").write_text(
        'Acquire::Retries "2";\nAcquire::http::Timeout "30";\n'
        'Acquire::https::Timeout "30";\n'
    )
    print(f"Ubuntu archive source files updated: {changed}; signature settings preserved")


if __name__ == "__main__":
    main()
