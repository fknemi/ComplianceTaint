let SessionLoad = 1
let s:so_save = &g:so | let s:siso_save = &g:siso | setg so=0 siso=0 | setl so=-1 siso=-1
let v:this_session=expand("<sfile>:p")
doautoall SessionLoadPre
silent only
silent tabonly
cd /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services
if expand('%') == '' && !&modified && line('$') <= 1 && getline(1) == ''
  let s:wipebuf = bufnr('%')
endif
let s:shortmess_save = &shortmess
set shortmess+=aoO
badd +1 user-service/userService.js
badd +1 /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/notification-service/notificationService.js
badd +1 /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/analytics-service/analyticsService.js
badd +1 /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/payment-service/paymentService.js
badd +1 /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/payment-service/crypto.js
argglobal
%argdel
edit /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/payment-service/paymentService.js
let s:save_splitbelow = &splitbelow
let s:save_splitright = &splitright
set splitbelow splitright
wincmd _ | wincmd |
vsplit
wincmd _ | wincmd |
vsplit
2wincmd h
wincmd w
wincmd w
let &splitbelow = s:save_splitbelow
let &splitright = s:save_splitright
wincmd t
let s:save_winminheight = &winminheight
let s:save_winminwidth = &winminwidth
set winminheight=0
set winheight=1
set winminwidth=0
set winwidth=1
exe 'vert 1resize ' . ((&columns * 20 + 63) / 127)
exe 'vert 2resize ' . ((&columns * 36 + 63) / 127)
exe 'vert 3resize ' . ((&columns * 69 + 63) / 127)
argglobal
balt /run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services/payment-service/crypto.js
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
silent! normal! zE
let &fdl = &fdl
let s:l = 1 - ((0 * winheight(0) + 27) / 55)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 1
normal! 0
wincmd w
argglobal
enew
file neo-tree\ filesystem\ \[1]
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
wincmd w
argglobal
if bufexists(fnamemodify("term:///run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services//385354:/usr/bin/zsh;\#toggleterm\#1", ":p")) | buffer term:///run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services//385354:/usr/bin/zsh;\#toggleterm\#1 | else | edit term:///run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services//385354:/usr/bin/zsh;\#toggleterm\#1 | endif
if &buftype ==# 'terminal'
  silent file term:///run/media/fknemi/CT1000P3SSD8/DEV/BuildSprint/BFSI-Demo-Repo/services//385354:/usr/bin/zsh;\#toggleterm\#1
endif
balt user-service/userService.js
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
let s:l = 42 - ((1 * winheight(0) + 27) / 55)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 42
normal! 04|
wincmd w
exe 'vert 1resize ' . ((&columns * 20 + 63) / 127)
exe 'vert 2resize ' . ((&columns * 36 + 63) / 127)
exe 'vert 3resize ' . ((&columns * 69 + 63) / 127)
tabnext 1
if exists('s:wipebuf') && len(win_findbuf(s:wipebuf)) == 0 && getbufvar(s:wipebuf, '&buftype') isnot# 'terminal'
  silent exe 'bwipe ' . s:wipebuf
endif
unlet! s:wipebuf
set winheight=1 winwidth=20
let &shortmess = s:shortmess_save
let &winminheight = s:save_winminheight
let &winminwidth = s:save_winminwidth
let s:sx = expand("<sfile>:p:r")."x.vim"
if filereadable(s:sx)
  exe "source " . fnameescape(s:sx)
endif
let &g:so = s:so_save | let &g:siso = s:siso_save
set hlsearch
nohlsearch
doautoall SessionLoadPost
unlet SessionLoad
" vim: set ft=vim :
