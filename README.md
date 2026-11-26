<h1 align="center">RevolveVLN: Evolving Egocentric Memory towards Spatial Intelligence in Vision-Language Navigation</h1>

<p align="center">
  <img src="https://img.shields.io/badge/arXiv-Pending-b31b1b?style=flat&amp;logo=arxiv&amp;logoColor=white" height="26" alt="arXiv preprint link pending" title="arXiv preprint link pending">
  &nbsp;
  <a href="https://www.youtube.com/watch?v=F9MoMPJtmbY"><img src="https://img.shields.io/badge/Video-YouTube-FF0000?style=flat&amp;logo=youtube&amp;logoColor=white" height="26" alt="Watch the RevolveVLN video on YouTube" title="Watch RevolveVLN on YouTube"></a>
  &nbsp;
  <a href="https://yilinj10.github.io/RevolveVLN/"><img src="https://img.shields.io/badge/%F0%9F%8F%A0%20Project-Website-1879ac?style=flat" height="26" alt="RevolveVLN project website" title="RevolveVLN project website"></a>
  &nbsp;
  <a href="https://huggingface.co/yilin-jia/RevolveVLN"><img src="https://img.shields.io/badge/Weights-Coming%20soon-a07908?style=flat&amp;logo=huggingface&amp;logoColor=FFD21E" height="26" alt="RevolveVLN weights on Hugging Face (coming soon)" title="RevolveVLN weights on Hugging Face (coming soon)"></a>
  &nbsp;
  <a href="https://github.com/YilinJ10/RevolveVLN"><img src="https://img.shields.io/badge/Code-GitHub-222222?style=flat&amp;logo=github&amp;logoColor=white" height="26" alt="Code on GitHub" title="RevolveVLN on GitHub"></a>
</p>

RevolveVLN builds **Evolving Egocentric Memory** from a stream of monocular RGB images. **Refresh** updates the visual features of past and current views with newly observed geometry. **Reinforce** reuses the current view’s attention weights to bring geometry into the early decoder layers. **Relate** uses relative camera poses and 3D points to connect remembered views to the current one before the model predicts its next actions.

![Figure 2. The streaming spatial encoder and visual encoder feed Refresh, Reinforce and Relate, which connect the instruction and remembered views to the next action chunk.](figures/framework.png)

## Navigation results

With benchmark training data alone, RevolveVLN reaches **64.2%** success on R2R-CE and **65.3%** on RxR-CE. With 1.10M additional training samples, the corresponding success rates are **69.3%** and **70.0%** on the validation-unseen splits.

[![Table 1 from the paper, comparing navigation methods on R2R-CE and RxR-CE. A copyable version is available in Paper tables.](results/table-1-vln-ce.png)](results/README.md#vln-ce)

On NavSpace, RevolveVLN achieves **29.1% macro success** with benchmark training data alone and **33.7%** with 1.10M additional samples. Both results are zero-shot averages across six spatial tasks.

<p align="center">
  <a href="results/table-2-navspace.png"><img src="results/table-2-navspace.png" width="100%" alt="Table 2 from the paper. Zero-shot NavSpace results for twelve models and training settings, including both RevolveVLN variants."></a>
</p>

## Real-world navigation

[![Figure 4. Six real-robot tasks pair camera observations with the corresponding spatial reconstructions.](figures/real-world-tasks.webp)](figures/real-world-tasks.webp)

## TODO

- [ ] Release checkpoints ([Hugging Face](https://huggingface.co/yilin-jia/RevolveVLN)).
- [ ] Release evaluation code.
- [ ] Release training code.

## Citation

If you find RevolveVLN helpful for your research, please consider giving us a star 🌟 and citing it:

```bibtex
@misc{jia_revolvevln,
  title  = {{RevolveVLN}: Evolving Egocentric Memory towards Spatial Intelligence
            in Vision-Language Navigation},
  author = {Jia, Yilin and Zhong, Yangyi and Yao, Hongze and Liu, Mai and
            Lv, Xiaohui and Tao, Shuai and Liu, Wulong and Li, Rong and
            Gong, Zeying and Hu, Tianshuai and Fan, Junfeng and Liang, Junwei}
}
```
