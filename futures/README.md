# 商品期货因子研究

用新浪财经的单合约日线（经 AKShare 下载）研究国内商品期货的经典因子：期限结构（Carry）、截面动量、时序动量，以及 Carry 和动量的合成。

## 用法

```bash
pip install -r requirements.txt
python fetch_sina.py      # 下载/增量更新单合约日线 -> data/contracts.parquet
python research.py        # 拼主力连续、算因子、回测 -> data/main_continuous.parquet, results/*.csv
```

`fetch_sina.py` 重复运行时只补拉还没到期的合约。新浪只保留大约最近 7~8 年到期的合约，更早的会逐渐查不到，所以 `data/contracts.parquet` 提交在仓库里留存。

## 数据

| 文件 | 内容 |
|---|---|
| `data/contracts.parquet` | 每个合约每天一行：date, contract, open, high, low, close, settle, volume, oi, symbol |
| `data/main_continuous.parquet` | 每个品种每天一行：当天的主力合约、主力上的日收益、主力 vs 次主力的年化 carry |
| `results/*.csv` | 回测结果（汇总指标、净值、逐年收益、IC、分组、参数网格、最新信号） |

用 DuckDB 直接查 Parquet，不需要数据库服务：

```python
import duckdb
duckdb.sql("""
    SELECT symbol, date, main, ret, carry
    FROM 'data/main_continuous.parquet'
    WHERE symbol = 'RB' ORDER BY date DESC LIMIT 5
""").show()
```

## 方法要点

- **主力连续**：每天选持仓量最大的合约为主力，只往远月换、不回滚；收益在同一合约内计算，换月不产生假跳空。
- **Carry**：主力与次主力（主力之后持仓最大的合约）的对数价差 × 12 / 相隔月数，近月贵为正。
- **动量**：主力连续过去 N 日累计对数收益。
- **组合**：截面策略做多前 20%、做空后 20%，组内按波动率倒数加权，多空各 0.5；时序动量按信号正负，总杠杆 1。
- **时点**：t 日收盘算信号，t+1 日收盘成交，从 t+2 日计收益（同一个收盘价既算信号又成交会被收盘价噪声带偏）；单边成本 3bp。
- **样本**：2019-07 起（之前主力链不完整），2023-01-01 前为样本内，之后为样本外。
