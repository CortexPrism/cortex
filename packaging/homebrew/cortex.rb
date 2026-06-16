class Cortex < Formula
  desc "CortexPrism - Open-source agentic harness for AI"
  homepage "https://cortexprism.io"
  url "https://github.com/CortexPrism/cortex/archive/refs/tags/v#{version}.tar.gz"
  license "MIT"
  head "https://github.com/CortexPrism/cortex.git", branch: "main"

  depends_on "deno"

  def install
    libexec.install Dir["*"]
    (bin/"cortex").write <<~EOS
      #!/bin/bash
      exec deno run --allow-all "#{libexec}/src/main.ts" "$@"
    EOS
    chmod 0755, bin/"cortex"
  end

  test do
    assert_match "cortex", shell_output("#{bin}/cortex --help")
  end
end
