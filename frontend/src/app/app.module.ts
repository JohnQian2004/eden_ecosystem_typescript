import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { ChatBoxComponent } from './components/chat-box/chat-box.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { IgasDisplayComponent } from './components/igas-display/igas-display.component';
import { LedgerDisplayComponent } from './components/ledger-display/ledger-display.component';
import { CertificateDisplayComponent } from './components/certificate-display/certificate-display.component';
import { WorkflowDisplayComponent } from './components/workflow-display/workflow-display.component';
import { WorkflowDisplay2Component } from './components/workflow-display2/workflow-display2.component';
import { WorkflowChatDisplayComponent } from './components/workflow-chat-display/workflow-chat-display.component';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';
import { FlowWiseService } from './services/flowwise.service';
import { MessagingService } from './services/messaging.service';
import { SystemConfigComponent } from './components/system-config/system-config.component';
import { MovieTheaterComponent } from './movie-theater/movie-theater.component';
import { LedgerCardDeckComponent } from './components/ledger-card-deck/ledger-card-deck.component';
import { DexGardenWizardComponent } from './components/dex-garden-wizard/dex-garden-wizard.component';
import { UsernameRegistrationComponent } from './components/username-registration/username-registration.component';
import { CacheInterceptor } from './services/cache.interceptor';

const routes: Routes = [
  { 
    path: 'dex-garden-wizard', 
    component: DexGardenWizardComponent 
  }
  // Note: AppComponent is the bootstrap component, so we don't need it as a route
  // The router-outlet in AppComponent will render DexGardenWizardComponent when on that route
];

@NgModule({
  declarations: [
    AppComponent,
    ChatBoxComponent,
    SidebarComponent,
    IgasDisplayComponent,
    LedgerDisplayComponent,
    CertificateDisplayComponent,
    WorkflowDisplayComponent,
    WorkflowDisplay2Component,
    WorkflowChatDisplayComponent,
    SystemConfigComponent,
    MovieTheaterComponent,
    LedgerCardDeckComponent,
    DexGardenWizardComponent,
    UsernameRegistrationComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forRoot(routes)
  ],
  providers: [
    WebSocketService, 
    ChatService, 
    FlowWiseService,
    MessagingService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CacheInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

