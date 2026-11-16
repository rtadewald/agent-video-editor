/** O quadro do vídeo: em pé (9:16, o padrão dos Reels) ou deitado (16:9: `edicao.saida` mais larga que alta, as VSLs
 *  horizontais). A página define uma vez, ao carregar o projeto, antes de qualquer conta.
 *  Deitado, a tela dividida é **lado a lado**: o insert à esquerda, em `LADO` da largura (a área fica 9:8, a do palco do
 *  motion dividido, 1080×960: o motion cabe nela sem sobra), e o ator à direita, enquadrado pelo rosto. */
export const QUADRO = { deitado: false }
export const LADO = (9 / 8) * (9 / 16)
/** Largura ÷ altura do quadro. */
export const larguraAltura = () => (QUADRO.deitado ? 16 / 9 : 9 / 16)
/** Deitado, os elementos (lettering, card do print, ManyChat) vão numa coluna 9:16 da altura do quadro: o tamanho deles
 *  acompanha a altura, como nos Reels, e não a largura. A largura da coluna, em fração da largura do quadro. */
export const COLUNA = (9 / 16) / (16 / 9)
