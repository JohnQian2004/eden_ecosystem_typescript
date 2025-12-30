import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { ChatBoxComponent } from './components/chat-box/chat-box.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { IgasDisplayComponent } from './components/igas-display/igas-display.component';
import { LedgerDisplayComponent } from './components/ledger-display/ledger-display.component';
import { CertificateDisplayComponent } from './components/certificate-display/certificate-display.component';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';
import { SystemConfigComponent } from './components/system-config/system-config.component';

@NgModule({
  declarations: [
    AppComponent,
    ChatBoxComponent,
    SidebarComponent,
    IgasDisplayComponent,
    LedgerDisplayComponent,
    CertificateDisplayComponent,
    SystemConfigComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule
  ],
  providers: [WebSocketService, ChatService],
  bootstrap: [AppComponent]
})
export class AppModule { }

