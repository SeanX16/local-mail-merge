# HR AI 人才信息工具｜明确需求整理

## 1. 工具范围

工具分为两个部分：

### 1.1 内部工具

用途：

- 批量区分文档
- 如果可以，修改文档 title

限制：

- 内部工具不能使用大模型
- 后续由同事提供 existing tools

### 1.2 外部工具

用途：

- 抓取顶会参加者信息
- 在私人电脑上运行
- 可以使用大模型
- 可以导出不同顶会的 Excel 名单

---

## 2. 内部工具需要提取的字段

1. Name (first)
2. Name (last)
3. Email
4. Country
5. Organization (company or school)
6. Job title
7. Student (Y/N)
8. Graduation year
9. Target school
   - Y/N
   - Based on target school list
   - 例如 QS 100、Ivy League
10. 会中文
    - Y/N
    - 例如通过 last name 区分
11. LinkedIn
    - 如果有则提取
12. Personal website
    - 如果有则提取
13. GitHub
    - 如果有则提取
14. Google Scholar
    - 如果有则提取

补充：

- Existing tools 由同事后续提供。

---

## 3. 外部工具需要提取的字段

1. Name (first)
2. Name (last)
3. Email
4. Country
5. Organization (company or school)
6. Job title
7. Student (Y/N)
8. Graduation year
9. Target school
   - Y/N
   - Based on target school list
   - 例如 QS 100、Ivy League
10. 会中文
    - Y/N
    - 例如通过 last name 区分
11. Presentation title
    - Based on conference website
    - 例如 published paper / oral paper / workshop
12. LinkedIn
    - 如果有则提取
13. Personal website
    - 如果有则提取
14. GitHub
    - 如果有则提取
15. Google Scholar
    - 如果有则提取

---

## 4. 目标岗位

### Graphics & Spatial Research Engineer

https://www.linkedin.com/jobs/view/4426760665/

### Video & Image Research Engineer

https://www.linkedin.com/jobs/view/4427143053/

### (Junior/Senior) Research Engineer – Audio Lab

https://www.linkedin.com/jobs/view/4405627229/

---

## 5. 目标顶会

- SIGGRAPH
- SIGGRAPH Asia
- 3DV
- AAAI
- ICML
- ICLR
- CVPR
- ECCV
- ICCV
- NeurIPS
- INTERSPEECH
- ICASSP

其中，音频方向的目标顶会为：

- INTERSPEECH
- ICASSP

---

## 6. SIGGRAPH 2022 参考链接

### SIGGRAPH 2022 官方 Proceedings

https://www.siggraph.org/wp-content/uploads/2022/08/SIGGRAPH-22-ACM-SIGGRAPH-2022-Conference-Proceedings.html

### Paper Copilot：SIGGRAPH 2022 Paper List

https://legacy.papercopilot.com/paper-list/siggraph-paper-list/siggraph-2022-paper-list/

---

## 7. Target School 定义

Target School 输出：

- Y
- N

需要支持以下定义范围：

- QS Top 50
- QS Top 100
- QS Top 200
- Ivy League

参考链接：

### QS World University Rankings 2026

https://www.topuniversities.com/world-university-rankings/2026

### Ivy League

https://www.qs.com/ivy-league
