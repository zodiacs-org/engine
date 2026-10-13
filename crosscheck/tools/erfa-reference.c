/* Crosscheck's own protocol driver, MIT. ERFA is downloaded at runtime. */
#include <stdio.h>
#include <math.h>
#include "erfa.h"
int main(void) {
  double days,p[3],v[3],e[3],q[3],s;
  while (1) {
    int n=scanf("%lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf %lf",
      &days,&p[0],&p[1],&p[2],&v[0],&v[1],&v[2],&e[0],&e[1],&e[2],&q[0],&q[1],&q[2],&s);
    if(n==EOF) return 0;
    if(n!=14) return 1;
    double dp,de,g,f,ps,ep,r[3][3],ec[3][3],ab[3],ld[3],distant[3];
    eraNut00b(2451545.0,days,&dp,&de);
    eraPfw06(2451545.0,days,&g,&f,&ps,&ep);
    eraFw2m(g,f,ps+dp,ep+de,r);
    eraFw2m(g,f,ps+dp,ep+de,ec);
    eraRx(ep+de,ec);
    double bm1=sqrt(1.0-eraPdp(v,v));
    eraAb(p,v,s,bm1,ab);
    double dlim=1e-6/fmax(1.0,s*s);
    eraLd(1.0,p,q,e,s,dlim,ld);
    eraLdsun(p,e,s,distant);
    printf("%.17g %.17g %.17g %.17g %.17g %.17g",dp,de,g,f,ps,ep);
    for(int i=0;i<3;i++) for(int j=0;j<3;j++) printf(" %.17g",r[i][j]);
    for(int i=0;i<3;i++) for(int j=0;j<3;j++) printf(" %.17g",ec[i][j]);
    for(int i=0;i<3;i++) printf(" %.17g",ab[i]);
    for(int i=0;i<3;i++) printf(" %.17g",ld[i]);
    for(int i=0;i<3;i++) printf(" %.17g",distant[i]);
    printf("\n");
  }
}
