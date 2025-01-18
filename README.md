# Bootstrap Agent

## Purpose

- コーディングのタスクを自動化したい
- 目的、用途によって、拡張・カスタマイズできるようにしたいが、その作業自体も自動化したい
- CLIから使えるエージェントがほしい

## Rules

- 自分ではコードを書かない
  - 書くのは最初にLLMとやりとりするスクリプトとプロンプトのみ
  - プロンプトの練習も兼ねている

# Log

## (1) Hello, World!

```bash
bash agent.sh "Hello, World!"
```

```
Hello, World! It's nice to meet you. What can I help you solve today? 😊 
```

